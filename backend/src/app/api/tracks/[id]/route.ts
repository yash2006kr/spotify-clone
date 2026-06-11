import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function DELETE() {
  return NextResponse.json(
    { error: "JioSaavn catalog songs cannot be deleted from this app." },
    { status: 405 }
  );
}
