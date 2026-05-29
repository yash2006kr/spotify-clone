import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { fieldValue, isNonEmptyFile, uploadFileToGridFS } from "@/lib/media";
import { ensureIndexes, getBucket, getDb } from "@/lib/mongodb";
import { trackToClient } from "@/lib/serializers";

export const runtime = "nodejs";

async function deleteCoverIfUnused(coverId: ObjectId) {
  const db = await getDb();
  const stillUsed = await db.collection("tracks").findOne({ coverId });

  if (stillUsed) {
    return;
  }

  const bucket = await getBucket("covers");

  try {
    await bucket.delete(coverId);
  } catch {
    // Missing GridFS files should not block album cover updates.
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const album = fieldValue(formData.get("album"));
    const cover = formData.get("cover");

    if (!album) {
      return NextResponse.json({ error: "Album name is required." }, { status: 400 });
    }

    if (!isNonEmptyFile(cover)) {
      return NextResponse.json({ error: "Choose a cover image." }, { status: 400 });
    }

    if (cover.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Cover image must be 8MB or smaller." }, { status: 413 });
    }

    if (cover.type && !cover.type.startsWith("image/")) {
      return NextResponse.json({ error: "Cover file must be an image." }, { status: 400 });
    }

    await ensureIndexes();
    const db = await getDb();
    const existingTracks = await db.collection("tracks").find({ album }).toArray();

    if (!existingTracks.length) {
      return NextResponse.json({ error: "Album not found." }, { status: 404 });
    }

    const coverBucket = await getBucket("covers");
    const coverId = await uploadFileToGridFS(coverBucket, cover, {
      kind: "album-cover",
      album,
      uploadedBy: user._id,
      uploadedAt: new Date()
    });
    const previousCoverIds = new Map<string, ObjectId>();

    existingTracks.forEach((track) => {
      if (track.coverId instanceof ObjectId && !track.coverId.equals(coverId)) {
        previousCoverIds.set(track.coverId.toString(), track.coverId);
      }
    });

    await db.collection("tracks").updateMany({ album }, { $set: { coverId, updatedAt: new Date() } });

    await Promise.all([...previousCoverIds.values()].map((id) => deleteCoverIfUnused(id)));

    const updatedTracks = await db.collection("tracks").find({ album }).sort({ createdAt: -1 }).toArray();
    const likes = await db
      .collection("likes")
      .find({ userId: user._id, trackId: { $in: updatedTracks.map((track) => track._id) } })
      .toArray();
    const liked = new Set(likes.map((like) => like.trackId.toString()));

    return NextResponse.json({
      tracks: updatedTracks.map((track) => trackToClient(track, liked.has(track._id.toString())))
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to update album covers." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to update album cover." }, { status: 500 });
  }
}
