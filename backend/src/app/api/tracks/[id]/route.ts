import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getBucket, getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PlaylistDocument = {
  trackIds: ObjectId[];
  updatedAt: Date;
};

async function deleteFile(bucketName: "audio" | "covers", fileId: unknown) {
  if (!(fileId instanceof ObjectId)) {
    return;
  }

  const bucket = await getBucket(bucketName);

  try {
    await bucket.delete(fileId);
  } catch {
    // The database record is the source of truth; missing GridFS files should not block cleanup.
  }
}

async function deleteTrackCoverIfUnused(coverId: unknown, deletedTrackId: ObjectId) {
  if (!(coverId instanceof ObjectId)) {
    return;
  }

  const db = await getDb();
  const stillUsed = await db.collection("tracks").findOne({ _id: { $ne: deletedTrackId }, coverId });

  if (!stillUsed) {
    await deleteFile("covers", coverId);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireUser();
    const { id } = await context.params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Track not found." }, { status: 404 });
    }

    const db = await getDb();
    const trackObjectId = new ObjectId(id);
    const track = await db.collection("tracks").findOne({ _id: trackObjectId });
    const removeReferences = [
      db.collection("likes").deleteMany({ trackId: trackObjectId }),
      db.collection<PlaylistDocument>("playlists").updateMany(
        { trackIds: trackObjectId },
        { $pull: { trackIds: trackObjectId }, $set: { updatedAt: new Date() } }
      )
    ];

    if (!track) {
      await Promise.all(removeReferences);
      return NextResponse.json({ ok: true, missing: true });
    }

    await Promise.all([
      db.collection("tracks").deleteOne({ _id: trackObjectId }),
      ...removeReferences,
      deleteFile("audio", track.fileId),
      deleteTrackCoverIfUnused(track.coverId, trackObjectId)
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to delete songs." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to delete song." }, { status: 500 });
  }
}
