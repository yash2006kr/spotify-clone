import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PlaylistDocument = {
  _id: ObjectId;
  ownerId: ObjectId;
  trackIds: ObjectId[];
  updatedAt: Date;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { trackId } = await request.json();

    if (!ObjectId.isValid(id) || !ObjectId.isValid(trackId)) {
      return NextResponse.json({ error: "Playlist or track not found." }, { status: 404 });
    }

    const db = await getDb();
    const playlists = db.collection<PlaylistDocument>("playlists");
    const playlistObjectId = new ObjectId(id);
    const trackObjectId = new ObjectId(trackId);
    const [playlist, track] = await Promise.all([
      playlists.findOne({ _id: playlistObjectId, ownerId: user._id }),
      db.collection("tracks").findOne({ _id: trackObjectId })
    ]);

    if (!playlist || !track) {
      return NextResponse.json({ error: "Playlist or track not found." }, { status: 404 });
    }

    await playlists.updateOne(
      { _id: playlistObjectId },
      {
        $addToSet: { trackIds: trackObjectId },
        $set: { updatedAt: new Date() }
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to update this playlist." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to add track." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { trackId } = await request.json();

    if (!ObjectId.isValid(id) || !ObjectId.isValid(trackId)) {
      return NextResponse.json({ error: "Playlist or track not found." }, { status: 404 });
    }

    const db = await getDb();
    const playlists = db.collection<PlaylistDocument>("playlists");
    const playlistObjectId = new ObjectId(id);
    const playlist = await playlists.findOne({ _id: playlistObjectId, ownerId: user._id });

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    await playlists.updateOne(
      { _id: playlistObjectId },
      {
        $pull: { trackIds: new ObjectId(trackId) },
        $set: { updatedAt: new Date() }
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to update this playlist." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to remove track." }, { status: 500 });
  }
}
