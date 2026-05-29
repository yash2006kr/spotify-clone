import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { fieldValue, isNonEmptyFile, uploadFileToGridFS } from "@/lib/media";
import { ensureIndexes, getBucket, getDb } from "@/lib/mongodb";
import { playlistToClient } from "@/lib/serializers";

export const runtime = "nodejs";

const hexColorPattern = /^#[0-9a-f]{6}$/i;

function safeCoverColor(value: string) {
  const color = value.trim();
  return hexColorPattern.test(color) ? color.toLowerCase() : "";
}

async function readPlaylistPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    const body = await request.json();

    return {
      name: String(body.name || "").trim(),
      description: String(body.description || "").trim(),
      isPublic: Boolean(body.isPublic),
      cover: null,
      coverColor: safeCoverColor(String(body.coverColor || ""))
    };
  }

  const formData = await request.formData();

  return {
    name: fieldValue(formData.get("name")),
    description: fieldValue(formData.get("description")),
    isPublic: fieldValue(formData.get("isPublic")) === "true",
    cover: formData.get("cover"),
    coverColor: safeCoverColor(fieldValue(formData.get("coverColor")))
  };
}

export async function GET() {
  try {
    const user = await requireUser();

    await ensureIndexes();
    const db = await getDb();
    const playlists = await db
      .collection("playlists")
      .find({ $or: [{ ownerId: user._id }, { isPublic: true }] })
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json({ playlists: playlists.map((playlist) => playlistToClient(playlist)) });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to view playlists." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to load playlists." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const payload = await readPlaylistPayload(request);

    if (!payload.name) {
      return NextResponse.json({ error: "Playlist name is required." }, { status: 400 });
    }

    await ensureIndexes();
    const db = await getDb();
    const coverBucket = await getBucket("covers");
    const now = new Date();
    let coverId: ObjectId | undefined;

    if (isNonEmptyFile(payload.cover)) {
      if (payload.cover.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: "Cover image must be 8MB or smaller." }, { status: 413 });
      }

      if (payload.cover.type && !payload.cover.type.startsWith("image/")) {
        return NextResponse.json({ error: "Cover file must be an image." }, { status: 400 });
      }

      coverId = await uploadFileToGridFS(coverBucket, payload.cover, {
        kind: "playlist-cover",
        uploadedBy: user._id,
        uploadedAt: now
      });
    }

    const result = await db.collection("playlists").insertOne({
      name: payload.name,
      description: payload.description,
      coverId,
      coverColor: payload.coverColor,
      isPublic: payload.isPublic,
      trackIds: [],
      ownerId: user._id,
      ownerName: user.name,
      createdAt: now,
      updatedAt: now
    });
    const playlist = await db.collection("playlists").findOne({ _id: result.insertedId });

    if (!playlist) {
      return NextResponse.json({ error: "Unable to create playlist." }, { status: 500 });
    }

    return NextResponse.json({ playlist: playlistToClient(playlist) }, { status: 201 });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to create playlists." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to create playlist." }, { status: 500 });
  }
}
