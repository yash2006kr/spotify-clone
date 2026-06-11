import { NextResponse } from "next/server";

import { getSaavnPlaylists } from "@/lib/saavn";

export const runtime = "nodejs";

export async function GET() {
  try {
    const playlists = await getSaavnPlaylists();

    return NextResponse.json({ playlists });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load JioSaavn playlists." }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Local playlist creation was removed. Browse JioSaavn playlists from the catalog." },
    { status: 410 }
  );
}
