import type { AppNotification, AppUser, Playlist, Track } from "@/types";

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
  const id = playlist._id.toString();

  return {
    id,
    name: playlist.name || "Untitled Playlist",
    description: playlist.description || "",
    coverUrl: playlist.coverId ? `/api/playlists/${id}/cover` : null,
    coverColor: typeof playlist.coverColor === "string" ? playlist.coverColor : "",
    isPublic: Boolean(playlist.isPublic),
    ownerId: playlist.ownerId?.toString?.() || "",
    trackIds: (playlist.trackIds || []).map((id: unknown) => id?.toString()).filter(Boolean),
    ownerName: playlist.ownerName || "Music Fan",
    createdAt: dateString(playlist.createdAt),
    updatedAt: dateString(playlist.updatedAt),
    tracks
  };
}

export function notificationToClient(notification: AnyDocument): AppNotification {
  return {
    id: notification._id.toString(),
    title: notification.title || "Notification",
    message: notification.message || notification.body || "",
    targetEmail: notification.targetEmail || notification.userEmail || null,
    createdAt: dateString(notification.createdAt)
  };
}
