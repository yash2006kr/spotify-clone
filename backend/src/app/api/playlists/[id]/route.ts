import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { fieldValue, isNonEmptyFile, uploadFileToGridFS } from "@/lib/media";
import { getBucket, getDb } from "@/lib/mongodb";
import { playlistToClient, trackToClient } from "@/lib/serializers";
import type { Track } from "@/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const hexColorPattern = /^#[0-9a-f]{6}$/i;

function safeCoverColor(value: string) {
  const color = value.trim();
  return hexColorPattern.test(color) ? color.toLowerCase() : "";
}

async function readPlaylistPatch(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    const body = await request.json();

    return {
      name: typeof body.name === "string" ? body.name.trim() : undefined,
      description: typeof body.description === "string" ? body.description.trim() : undefined,
      isPublic: typeof body.isPublic === "boolean" ? body.isPublic : undefined,
      cover: null,
      coverColor: typeof body.coverColor === "string" ? safeCoverColor(body.coverColor) : undefined
    };
  }

  const formData = await request.formData();
  const isPublicValue = fieldValue(formData.get("isPublic"));
  const coverColorValue = fieldValue(formData.get("coverColor"));

  return {
    name: fieldValue(formData.get("name")) || undefined,
    description: formData.has("description") ? fieldValue(formData.get("description")) : undefined,
    isPublic: isPublicValue ? isPublicValue === "true" : undefined,
    cover: formData.get("cover"),
    coverColor: coverColorValue ? safeCoverColor(coverColorValue) : undefined
  };
}

async function getPlaylist(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const db = await getDb();
  return db.collection("playlists").findOne({ _id: new ObjectId(id) });
}

async function getOwnedPlaylist(id: string, userId: ObjectId) {
  const playlist = await getPlaylist(id);

  if (!playlist || !(playlist.ownerId instanceof ObjectId) || !playlist.ownerId.equals(userId)) {
    return null;
  }

  return playlist;
}

async function deleteCoverFile(fileId: unknown) {
  if (!(fileId instanceof ObjectId)) {
    return;
  }

  const bucket = await getBucket("covers");

  try {
    await bucket.delete(fileId);
  } catch {
    // Missing GridFS files should not block playlist metadata updates.
  }
}

function missingTrackToClient(trackId: ObjectId): Track {
  return {
    id: trackId.toString(),
    title: "Deleted song",
    artist: "Missing from library",
    album: "Removed",
    genre: "Unavailable",
    duration: 0,
    plays: 0,
    liked: false,
    uploadedById: "",
    uploadedByName: "Unknown",
    createdAt: new Date(0).toISOString(),
    audioUrl: "",
    coverUrl: null,
    missing: true
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const playlist = await getPlaylist(id);

    const isOwner = playlist?.ownerId instanceof ObjectId && playlist.ownerId.equals(user._id);

    if (!playlist || (!isOwner && !playlist.isPublic)) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    const db = await getDb();
    const trackIds = playlist.trackIds || [];
    const tracks = trackIds.length
      ? await db
          .collection("tracks")
          .find({ _id: { $in: trackIds } })
          .toArray()
      : [];
    const liked = new Set<string>();

    if (trackIds.length) {
      const likes = await db
        .collection("likes")
        .find({
          userId: user._id,
          trackId: { $in: trackIds }
        })
        .toArray();

      likes.forEach((like) => liked.add(like.trackId.toString()));
    }

    const orderedTracks = trackIds.flatMap((trackId: ObjectId) => {
      const track = tracks.find((item) => item._id.equals(trackId));
      return track
        ? [trackToClient(track, liked.has(track._id.toString()))]
        : isOwner
          ? [missingTrackToClient(trackId)]
          : [];
    });

    return NextResponse.json({ playlist: playlistToClient(playlist, orderedTracks) });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to view this playlist." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to load playlist." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const playlist = await getOwnedPlaylist(id, user._id);

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    const payload = await readPlaylistPatch(request);
    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (payload.name) {
      update.name = payload.name;
    }

    if (typeof payload.description === "string") {
      update.description = payload.description;
    }

    if (typeof payload.isPublic === "boolean") {
      update.isPublic = payload.isPublic;
    }

    if (typeof payload.coverColor === "string") {
      update.coverColor = payload.coverColor;
    }

    if (isNonEmptyFile(payload.cover)) {
      if (payload.cover.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: "Cover image must be 8MB or smaller." }, { status: 413 });
      }

      if (payload.cover.type && !payload.cover.type.startsWith("image/")) {
        return NextResponse.json({ error: "Cover file must be an image." }, { status: 400 });
      }

      const coverBucket = await getBucket("covers");
      update.coverId = await uploadFileToGridFS(coverBucket, payload.cover, {
        kind: "playlist-cover",
        uploadedBy: user._id,
        uploadedAt: new Date()
      });
    }

    const db = await getDb();
    await db.collection("playlists").updateOne({ _id: playlist._id }, { $set: update });
    const next = await db.collection("playlists").findOne({ _id: playlist._id });

    if (!next) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    if (update.coverId) {
      await deleteCoverFile(playlist.coverId);
    }

    return NextResponse.json({ playlist: playlistToClient(next) });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to edit this playlist." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to update playlist." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const playlist = await getOwnedPlaylist(id, user._id);

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
    }

    const db = await getDb();
    await db.collection("playlists").deleteOne({ _id: playlist._id });
    await deleteCoverFile(playlist.coverId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to delete this playlist." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to delete playlist." }, { status: 500 });
  }
}
