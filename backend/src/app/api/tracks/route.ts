import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, requireUser } from "@/lib/auth";
import { fieldValue, filenameWithoutExtension, isNonEmptyFile, numberField, uploadFileToGridFS } from "@/lib/media";
import { ensureIndexes, getBucket, getDb } from "@/lib/mongodb";
import { trackToClient } from "@/lib/serializers";

export const runtime = "nodejs";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  try {
    await ensureIndexes();
    const user = await getCurrentUser();
    const db = await getDb();
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const filter = search
      ? {
          $or: ["title", "artist", "album", "genre"].map((field) => ({
            [field]: new RegExp(escapeRegExp(search), "i")
          }))
        }
      : {};

    const tracks = await db.collection("tracks").find(filter).sort({ createdAt: -1 }).limit(300).toArray();
    const liked = new Set<string>();

    if (user && tracks.length) {
      const likes = await db
        .collection("likes")
        .find({
          userId: user._id,
          trackId: { $in: tracks.map((track) => track._id) }
        })
        .toArray();

      likes.forEach((like) => liked.add(like.trackId.toString()));
    }

    return NextResponse.json({
      tracks: tracks.map((track) => trackToClient(track, liked.has(track._id.toString())))
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load tracks." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const audio = formData.get("audio");
    const cover = formData.get("cover");

    if (!isNonEmptyFile(audio)) {
      return NextResponse.json({ error: "Choose an audio file to upload." }, { status: 400 });
    }

    if (audio.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file must be 100MB or smaller." }, { status: 413 });
    }

    if (audio.type && !audio.type.startsWith("audio/")) {
      return NextResponse.json({ error: "The selected file must be audio." }, { status: 400 });
    }

    await ensureIndexes();
    const db = await getDb();
    const audioBucket = await getBucket("audio");
    const coverBucket = await getBucket("covers");
    const now = new Date();
    const title = fieldValue(formData.get("title"), filenameWithoutExtension(audio.name)) || "Untitled Track";
    const artist = fieldValue(formData.get("artist"), user.name || "Unknown Artist") || "Unknown Artist";
    const album = fieldValue(formData.get("album"), "Single") || "Single";
    const genre = fieldValue(formData.get("genre"), "Uploaded") || "Uploaded";
    const duration = Math.max(0, numberField(formData.get("duration")));
    const playlistId = fieldValue(formData.get("playlistId"));
    let playlistObjectId: ObjectId | null = null;

    if (playlistId) {
      if (!ObjectId.isValid(playlistId)) {
        return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
      }

      playlistObjectId = new ObjectId(playlistId);
      const playlist = await db.collection("playlists").findOne({ _id: playlistObjectId, ownerId: user._id });

      if (!playlist) {
        return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
      }
    }

    const fileId = await uploadFileToGridFS(audioBucket, audio, {
      kind: "audio",
      uploadedBy: user._id,
      uploadedAt: now
    });
    let coverId: ObjectId | undefined;

    if (isNonEmptyFile(cover)) {
      if (cover.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: "Cover image must be 8MB or smaller." }, { status: 413 });
      }

      if (cover.type && !cover.type.startsWith("image/")) {
        return NextResponse.json({ error: "Cover file must be an image." }, { status: 400 });
      }

      coverId = await uploadFileToGridFS(coverBucket, cover, {
        kind: "cover",
        uploadedBy: user._id,
        uploadedAt: now
      });
    }

    const result = await db.collection("tracks").insertOne({
      title,
      artist,
      album,
      genre,
      duration,
      fileId,
      coverId,
      originalFilename: audio.name,
      mimeType: audio.type || "audio/mpeg",
      size: audio.size,
      uploadedBy: user._id,
      uploadedByName: user.name,
      plays: 0,
      createdAt: now,
      updatedAt: now
    });

    const track = await db.collection("tracks").findOne({ _id: result.insertedId });

    if (!track) {
      return NextResponse.json({ error: "Unable to save uploaded track." }, { status: 500 });
    }

    if (playlistObjectId) {
      await db.collection("playlists").updateOne(
        { _id: playlistObjectId, ownerId: user._id },
        {
          $addToSet: { trackIds: track._id },
          $set: { updatedAt: new Date() }
        }
      );
    }

    return NextResponse.json({ track: trackToClient(track, false) }, { status: 201 });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to upload songs." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to upload track." }, { status: 500 });
  }
}
