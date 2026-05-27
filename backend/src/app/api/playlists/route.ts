import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { ensureIndexes, getDb } from "@/lib/mongodb";
import { playlistToClient } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();

    await ensureIndexes();
    const db = await getDb();
    const playlists = await db
      .collection("playlists")
      .find({ ownerId: user._id })
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
    const body = await request.json();
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();

    if (!name) {
      return NextResponse.json({ error: "Playlist name is required." }, { status: 400 });
    }

    await ensureIndexes();
    const db = await getDb();
    const now = new Date();
    const result = await db.collection("playlists").insertOne({
      name,
      description,
      isPublic: Boolean(body.isPublic),
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
