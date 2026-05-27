import { Readable } from "stream";

import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { getBucket, getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Cover not found." }, { status: 404 });
  }

  const db = await getDb();
  const track = await db.collection("tracks").findOne({ _id: new ObjectId(id) });

  if (!track?.coverId) {
    return NextResponse.json({ error: "Cover not found." }, { status: 404 });
  }

  const bucket = await getBucket("covers");
  const file = await bucket.find({ _id: track.coverId }).next();

  if (!file) {
    return NextResponse.json({ error: "Cover not found." }, { status: 404 });
  }

  const stream = bucket.openDownloadStream(file._id);
  const contentType =
    (file as { contentType?: string; metadata?: { contentType?: string } }).contentType ||
    file.metadata?.contentType ||
    "image/jpeg";

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(file.length),
      "Cache-Control": "private, max-age=86400"
    }
  });
}
