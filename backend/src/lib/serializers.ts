import type { AppUser, Playlist, Track } from "@/types";

type AnyDocument = Record<string, any>;

function dateString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return new Date().toISOString();
}

export function userToClient(user: AnyDocument): AppUser {
  return {
    id: user._id.toString(),
    name: user.name || user.email?.split("@")[0] || "Music Fan",
    email: user.email,
    picture: user.picture || undefined
  };
}

export function trackToClient(track: AnyDocument, liked = false): Track {
  const id = track._id.toString();

  return {
    id,
    title: track.title || "Untitled Track",
    artist: track.artist || "Unknown Artist",
    album: track.album || "Single",
    genre: track.genre || "Uploaded",
    duration: Number(track.duration || 0),
    plays: Number(track.plays || 0),
    liked,
    uploadedById: track.uploadedBy?.toString?.() || "",
    uploadedByName: track.uploadedByName || "Unknown",
    createdAt: dateString(track.createdAt),
    audioUrl: `/api/tracks/${id}/stream`,
    coverUrl: track.coverId ? `/api/tracks/${id}/cover` : null
  };
}

export function playlistToClient(playlist: AnyDocument, tracks?: Track[]): Playlist {
  return {
    id: playlist._id.toString(),
    name: playlist.name || "Untitled Playlist",
    description: playlist.description || "",
    isPublic: Boolean(playlist.isPublic),
    trackIds: (playlist.trackIds || []).map((id: unknown) => id?.toString()).filter(Boolean),
    ownerName: playlist.ownerName || "Music Fan",
    createdAt: dateString(playlist.createdAt),
    updatedAt: dateString(playlist.updatedAt),
    tracks
  };
}
