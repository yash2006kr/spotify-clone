import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function DELETE() {
  return NextResponse.json(
    { error: "music catalog songs cannot be deleted from this app." },
    { status: 405 }
  );
}
