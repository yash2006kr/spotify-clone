import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const db = await getDb();
  await db.collection("tracks").updateOne({ _id: new ObjectId(id) }, { $inc: { plays: 1 } });

  return NextResponse.json({ ok: true });
}
