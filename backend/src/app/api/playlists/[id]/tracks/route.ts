import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "JioSaavn playlists are read-only in this app." },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "JioSaavn playlists are read-only in this app." },
    { status: 405 }
  );
}
