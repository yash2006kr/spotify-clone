import { Readable } from "stream";

import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { getBucket, getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function invalidRange(length: number) {
  return new Response(null, {
    status: 416,
    headers: {
      "Content-Range": `bytes */${length}`
    }
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const db = await getDb();
  const track = await db.collection("tracks").findOne({ _id: new ObjectId(id) });

  if (!track?.fileId) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const bucket = await getBucket("audio");
  const file = await bucket.find({ _id: track.fileId }).next();

  if (!file) {
    return NextResponse.json({ error: "Audio file not found." }, { status: 404 });
  }

  const range = request.headers.get("range");
  const contentType =
    (file as { contentType?: string; metadata?: { contentType?: string } }).contentType ||
    file.metadata?.contentType ||
    track.mimeType ||
    "audio/mpeg";

  if (!range) {
    const stream = bucket.openDownloadStream(file._id);

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(file.length),
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400"
      }
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);

  if (!match) {
    return invalidRange(file.length);
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : file.length - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= file.length) {
    return invalidRange(file.length);
  }

  const safeEnd = Math.min(end, file.length - 1);
  const stream = bucket.openDownloadStream(file._id, { start, end: safeEnd + 1 });

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(safeEnd - start + 1),
      "Content-Range": `bytes ${start}-${safeEnd}/${file.length}`,
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400"
    }
  });
}
