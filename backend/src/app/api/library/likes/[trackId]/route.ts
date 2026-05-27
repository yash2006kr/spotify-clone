import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { ensureIndexes, getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ trackId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { trackId } = await context.params;

    if (!ObjectId.isValid(trackId)) {
      return NextResponse.json({ error: "Track not found." }, { status: 404 });
    }

    await ensureIndexes();
    const db = await getDb();
    const trackObjectId = new ObjectId(trackId);
    const track = await db.collection("tracks").findOne({ _id: trackObjectId });

    if (!track) {
      return NextResponse.json({ error: "Track not found." }, { status: 404 });
    }

    await db.collection("likes").updateOne(
      { userId: user._id, trackId: trackObjectId },
      {
        $setOnInsert: {
          userId: user._id,
          trackId: trackObjectId,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    return NextResponse.json({ liked: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to like songs." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to update likes." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { trackId } = await context.params;

    if (!ObjectId.isValid(trackId)) {
      return NextResponse.json({ error: "Track not found." }, { status: 404 });
    }

    const db = await getDb();
    await db.collection("likes").deleteOne({ userId: user._id, trackId: new ObjectId(trackId) });

    return NextResponse.json({ liked: false });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to update likes." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to update likes." }, { status: 500 });
  }
}
