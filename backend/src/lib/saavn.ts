import type { Playlist, Track } from "@/types";

const saavnBaseUrl = "https://saavn.sumit.co/api";
const saavnOwnerId = "jiosaavn";
const saavnOwnerName = "Music Catalog";
const trendingSearches = [
  "trending hindi songs",
  "top hindi songs",
  "bollywood top 50",
  "viral hindi songs",
  "new hindi songs",
  "punjabi trending songs",
  "telugu trending songs",
  "tamil trending songs",
  "kannada trending songs",
  "malayalam trending songs",
  "india pop hits",
  "arijit singh trending",
  "party hits india",
  "romantic hindi hits"
];
const defaultPlaylistSearches = ["hindi hits", "arijit singh", "telugu hits", "tamil hits", "bollywood"];

type SaavnImage = {
  quality?: string;
  url?: string;
};

type SaavnArtist = {
  id?: string;
  name?: string;
  image?: SaavnImage[];
};

type SaavnSong = {
  id?: string;
  name?: string;
  title?: string;
  type?: string;
  year?: string | number | null;
  releaseDate?: string | null;
  duration?: string | number | null;
  playCount?: string | number | null;
  language?: string | null;
  album?: {
    id?: string | null;
    name?: string | null;
    url?: string | null;
  };
  artists?: {
    primary?: SaavnArtist[];
    featured?: SaavnArtist[];
    all?: SaavnArtist[];
  };
  image?: SaavnImage[];
  downloadUrl?: SaavnImage[];
  primaryArtists?: string;
  singers?: string;
  url?: string;
};

type SaavnPlaylist = {
  id?: string;
  name?: string;
  title?: string;
  description?: string | null;
  songCount?: string | number | null;
  language?: string | null;
  image?: SaavnImage[];
  songs?: SaavnSong[] | null;
};

type SaavnEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

type SearchSongsData = {
  results?: SaavnSong[];
};

type SearchPlaylistsData = {
  results?: SaavnPlaylist[];
};

function decodeHtml(value: string) {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&quot;": "\"",
    "&#039;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">"
  };

  return value.replace(/&(amp|quot|#039|apos|lt|gt);/g, (entity) => entities[entity] || entity).trim();
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? decodeHtml(value) : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : fallback;
}

function bestMediaUrl(items: SaavnImage[] | undefined, preferredQuality = "500x500") {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }

  return (
    items.find((item) => item.quality === preferredQuality)?.url ||
    items.find((item) => item.url)?.url ||
    null
  );
}

function bestAudioUrl(song: SaavnSong) {
  return (
    bestMediaUrl(song.downloadUrl, "320kbps") ||
    bestMediaUrl(song.downloadUrl, "160kbps") ||
    bestMediaUrl(song.downloadUrl, "96kbps") ||
    null
  );
}

function artistNames(song: SaavnSong) {
  const primary = song.artists?.primary?.map((artist) => artist.name).filter(Boolean);

  if (primary?.length) {
    return primary.map((name) => stringValue(name)).join(", ");
  }

  return stringValue(song.primaryArtists || song.singers, "Unknown Artist");
}

export function saavnSongToTrack(song: SaavnSong, liked = false): Track | null {
  const id = stringValue(song.id);

  if (!id) {
    return null;
  }

  const title = stringValue(song.name || song.title, "Untitled Track");
  const year = stringValue(song.year);
  const createdAt = song.releaseDate || (year ? `${year}-01-01T00:00:00.000Z` : new Date().toISOString());
  const albumName = stringValue(song.album?.name, "Single");

  return {
    id,
    title,
    artist: artistNames(song),
    album: albumName,
    genre: stringValue(song.language, "Music Catalog"),
    duration: numberValue(song.duration),
    plays: numberValue(song.playCount),
    liked,
    uploadedById: saavnOwnerId,
    uploadedByName: saavnOwnerName,
    createdAt,
    audioUrl: `/api/tracks/${encodeURIComponent(id)}/stream`,
    coverUrl: bestMediaUrl(song.image),
    sourceUrl: song.url,
    albumId: song.album?.id || undefined
  };
}

export function saavnPlaylistToClient(playlist: SaavnPlaylist, tracks?: Track[]): Playlist | null {
  const id = stringValue(playlist.id);

  if (!id) {
    return null;
  }

  const trackIds = tracks?.map((track) => track.id) || [];

  return {
    id,
    name: stringValue(playlist.name || playlist.title, "Featured Playlist"),
    description: stringValue(playlist.description, stringValue(playlist.language, "Featured playlist")),
    coverUrl: bestMediaUrl(playlist.image),
    coverColor: "#1ed760",
    isPublic: true,
    ownerId: saavnOwnerId,
    trackIds,
    ownerName: saavnOwnerName,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date().toISOString(),
    tracks
  };
}

async function saavnFetch<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`${saavnBaseUrl}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const result = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 900 }
  });

  if (!result.ok) {
    throw new Error(`Music Catalog API returned ${result.status}`);
  }

  const body = (await result.json()) as SaavnEnvelope<T>;

  if (body.success === false) {
    throw new Error(body.message || "Music Catalog API request failed.");
  }

  return body.data as T;
}

function rankedTracks(tracks: Track[]) {
  return [...tracks].sort((a, b) => {
    if (b.plays !== a.plays) {
      return b.plays - a.plays;
    }

    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });
}

function catalogSearches() {
  const pivot = Math.floor(Date.now() / 3_600_000) % trendingSearches.length;
  const rotated = [...trendingSearches.slice(pivot), ...trendingSearches.slice(0, pivot)];

  return rotated.slice(0, 7);
}

export async function searchSaavnTracks(query: string, likedIds = new Set<string>(), limit = 24) {
  const data = await saavnFetch<SearchSongsData>("/search/songs", { query, limit });
  return (data.results || [])
    .map((song) => saavnSongToTrack(song, likedIds.has(String(song.id || ""))))
    .filter((track): track is Track => Boolean(track));
}

export async function getSaavnTrack(id: string, likedIds = new Set<string>()) {
  const data = await saavnFetch<SaavnSong[]>(`/songs/${encodeURIComponent(id)}`);
  const song = data[0];
  return song ? saavnSongToTrack(song, likedIds.has(id)) : null;
}

export async function getSaavnAudioUrl(id: string) {
  const data = await saavnFetch<SaavnSong[]>(`/songs/${encodeURIComponent(id)}`);
  return data[0] ? bestAudioUrl(data[0]) : null;
}

export async function getSaavnCatalog(likedIds = new Set<string>()) {
  const groups = await Promise.allSettled(catalogSearches().map((query) => searchSaavnTracks(query, likedIds, 24)));
  const tracks = groups.flatMap((group) => (group.status === "fulfilled" ? group.value : []));
  const unique = new Map<string, Track>();

  tracks.forEach((track) => unique.set(track.id, track));

  return rankedTracks([...unique.values()]).slice(0, 90);
}

export async function getSaavnPlaylists() {
  const groups = await Promise.allSettled(
    defaultPlaylistSearches.map((query) => saavnFetch<SearchPlaylistsData>("/search/playlists", { query, limit: 8 }))
  );
  const playlists = groups
    .flatMap((group) => (group.status === "fulfilled" ? group.value.results || [] : []))
    .map((playlist) => saavnPlaylistToClient(playlist))
    .filter((playlist): playlist is Playlist => Boolean(playlist));
  const unique = new Map<string, Playlist>();

  playlists.forEach((playlist) => unique.set(playlist.id, playlist));

  return [...unique.values()].slice(0, 32);
}

export async function getSaavnPlaylist(id: string, likedIds = new Set<string>()) {
  const data = await saavnFetch<SaavnPlaylist>("/playlists", { id, limit: 50 });
  const tracks = (data.songs || [])
    .map((song) => saavnSongToTrack(song, likedIds.has(String(song.id || ""))))
    .filter((track): track is Track => Boolean(track));

  return saavnPlaylistToClient(data, tracks);
}
