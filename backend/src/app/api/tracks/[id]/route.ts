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

function isSameObjectId(left: unknown, right: ObjectId) {
  return left instanceof ObjectId && left.equals(right);
}

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

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Track not found." }, { status: 404 });
    }

    const db = await getDb();
    const trackObjectId = new ObjectId(id);
    const track = await db.collection("tracks").findOne({ _id: trackObjectId });

    if (!track) {
      return NextResponse.json({ error: "Track not found." }, { status: 404 });
    }

    if (track.uploadedBy && !isSameObjectId(track.uploadedBy, user._id)) {
      return NextResponse.json({ error: "Only the uploader can delete this song." }, { status: 403 });
    }

    await Promise.all([
      db.collection("tracks").deleteOne({ _id: trackObjectId }),
      db.collection("likes").deleteMany({ trackId: trackObjectId }),
      db.collection<PlaylistDocument>("playlists").updateMany(
        { trackIds: trackObjectId },
        { $pull: { trackIds: trackObjectId }, $set: { updatedAt: new Date() } }
      ),
      deleteFile("audio", track.fileId),
      deleteFile("covers", track.coverId)
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
