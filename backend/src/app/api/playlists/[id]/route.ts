import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { playlistToClient, trackToClient } from "@/lib/serializers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function getOwnedPlaylist(id: string, userId: ObjectId) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const db = await getDb();
  return db.collection("playlists").findOne({ _id: new ObjectId(id), ownerId: userId });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const playlist = await getOwnedPlaylist(id, user._id);

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    const db = await getDb();
    const trackIds = playlist.trackIds || [];
    const tracks = trackIds.length
      ? await db
          .collection("tracks")
          .find({ _id: { $in: trackIds } })
          .toArray()
      : [];
    const orderedTracks = trackIds.flatMap((trackId: ObjectId) => {
      const track = tracks.find((item) => item._id.equals(trackId));
      return track ? [trackToClient(track, false)] : [];
    });

    return NextResponse.json({ playlist: playlistToClient(playlist, orderedTracks) });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to view this playlist." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to load playlist." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const playlist = await getOwnedPlaylist(id, user._id);

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    const body = await request.json();
    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.name === "string" && body.name.trim()) {
      update.name = body.name.trim();
    }

    if (typeof body.description === "string") {
      update.description = body.description.trim();
    }

    if (typeof body.isPublic === "boolean") {
      update.isPublic = body.isPublic;
    }

    const db = await getDb();
    await db.collection("playlists").updateOne({ _id: playlist._id }, { $set: update });
    const next = await db.collection("playlists").findOne({ _id: playlist._id });

    if (!next) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    return NextResponse.json({ playlist: playlistToClient(next) });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to edit this playlist." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to update playlist." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const playlist = await getOwnedPlaylist(id, user._id);

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    const db = await getDb();
    await db.collection("playlists").deleteOne({ _id: playlist._id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to delete this playlist." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to delete playlist." }, { status: 500 });
  }
}
