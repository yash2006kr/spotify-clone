import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getSaavnCatalog, searchSaavnTracks } from "@/lib/saavn";

export const runtime = "nodejs";

async function likedTrackIds() {
  const user = await getCurrentUser();

  if (!user) {
    return new Set<string>();
  }

  const db = await getDb();
  const likes = await db.collection("likes").find({ userId: user._id }).toArray();

  return new Set(likes.map((like) => String(like.trackId)).filter(Boolean));
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const liked = await likedTrackIds();
    const tracks = search ? await searchSaavnTracks(search, liked, 36) : await getSaavnCatalog(liked);

    return NextResponse.json({ tracks });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load songs from the catalog." }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "MP3 uploads were removed. Search the catalog and play songs directly from the catalog." },
    { status: 410 }
  );
}
