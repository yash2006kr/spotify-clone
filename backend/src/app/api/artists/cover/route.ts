import { Readable } from "stream";

import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { fieldValue, isNonEmptyFile, uploadFileToGridFS } from "@/lib/media";
import { ensureIndexes, getBucket, getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

function artistKey(artist: string) {
  return artist.trim().toLowerCase();
}

function artistCoverUrl(artist: string) {
  return `/api/artists/cover?artist=${encodeURIComponent(artist)}`;
}

async function deleteCoverIfUnused(coverId: ObjectId, artistKeyToIgnore = "") {
  const db = await getDb();
  const [trackUsingCover, artistUsingCover] = await Promise.all([
    db.collection("tracks").findOne({ coverId }),
    db.collection("artistCovers").findOne({
      coverId,
      ...(artistKeyToIgnore ? { artistKey: { $ne: artistKeyToIgnore } } : {})
    })
  ]);

  if (trackUsingCover || artistUsingCover) {
    return;
  }

  const bucket = await getBucket("covers");

  try {
    await bucket.delete(coverId);
  } catch {
    // Missing GridFS files should not block artist profile cover updates.
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureIndexes();
    const db = await getDb();

    if (request.nextUrl.searchParams.get("list") === "1") {
      const covers = await db.collection("artistCovers").find({}).sort({ updatedAt: -1 }).limit(500).toArray();

      return NextResponse.json({
        covers: covers.map((cover) => ({
          artist: cover.artist || "",
          coverUrl: cover.artist ? artistCoverUrl(cover.artist) : null
        }))
      });
    }

    const artist = fieldValue(request.nextUrl.searchParams.get("artist"));

    if (!artist) {
      return NextResponse.json({ error: "Artist is required." }, { status: 400 });
    }

    const cover = await db.collection("artistCovers").findOne({ artistKey: artistKey(artist) });

    if (!cover?.coverId) {
      return NextResponse.json({ error: "Cover not found." }, { status: 404 });
    }

    const bucket = await getBucket("covers");
    const file = await bucket.find({ _id: cover.coverId }).next();

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
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load artist cover." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const artist = fieldValue(formData.get("artist"));
    const cover = formData.get("cover");

    if (!artist) {
      return NextResponse.json({ error: "Artist name is required." }, { status: 400 });
    }

    if (!isNonEmptyFile(cover)) {
      return NextResponse.json({ error: "Choose a cover image." }, { status: 400 });
    }

    if (cover.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Cover image must be 8MB or smaller." }, { status: 413 });
    }

    if (cover.type && !cover.type.startsWith("image/")) {
      return NextResponse.json({ error: "Cover file must be an image." }, { status: 400 });
    }

    await ensureIndexes();
    const db = await getDb();
    const key = artistKey(artist);
    const hasArtistTracks = await db.collection("tracks").findOne({ artist });

    if (!hasArtistTracks) {
      return NextResponse.json({ error: "Artist not found." }, { status: 404 });
    }

    const previous = await db.collection("artistCovers").findOne({ artistKey: key });
    const coverBucket = await getBucket("covers");
    const coverId = await uploadFileToGridFS(coverBucket, cover, {
      kind: "artist-profile-cover",
      artist,
      uploadedBy: user._id,
      uploadedAt: new Date()
    });
    const now = new Date();

    await db.collection("artistCovers").updateOne(
      { artistKey: key },
      {
        $set: {
          artist,
          artistKey: key,
          coverId,
          updatedAt: now,
          updatedBy: user._id
        },
        $setOnInsert: {
          createdAt: now
        }
      },
      { upsert: true }
    );

    if (previous?.coverId instanceof ObjectId && !previous.coverId.equals(coverId)) {
      await deleteCoverIfUnused(previous.coverId, key);
    }

    return NextResponse.json({ artist: { name: artist, coverUrl: artistCoverUrl(artist) } });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to update artist covers." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to update artist cover." }, { status: 500 });
  }
}
