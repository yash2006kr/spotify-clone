import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getSaavnPlaylist } from "@/lib/saavn";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function likedTrackIds() {
  const user = await getCurrentUser();

  if (!user) {
    return new Set<string>();
  }

  const db = await getDb();
  const likes = await db.collection("likes").find({ userId: user._id }).toArray();

  return new Set(likes.map((like) => String(like.trackId)).filter(Boolean));
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const playlist = await getSaavnPlaylist(id, await likedTrackIds());

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    return NextResponse.json({ playlist });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load this Featured playlist." }, { status: 500 });
  }
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Featured playlists cannot be edited from this app." },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Featured playlists cannot be deleted from this app." },
    { status: 405 }
  );
}
