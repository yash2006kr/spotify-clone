"use client";

import {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ArrowLeft,
  Bell,
  Clock3,
  Disc3,
  Download,
  Heart,
  Home,
  Library,
  ListMusic,
  Loader2,
  LogOut,
  Maximize2,
  Mic2,
  MoreHorizontal,
  Music,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  UserRound,
  Volume2,
  X
} from "lucide-react";

import { AuthScreen } from "@/components/AuthScreen";
import { apiFetch, clearSessionToken, mediaUrl } from "@/lib/api";
import type { AppNotification, AppUser, Playlist, Track } from "@/types";

type ViewState =
  | "home"
  | "liked"
  | "songs"
  | "podcasts"
  | "recent"
  | "most"
  | `playlist:${string}`
  | `album:${string}`
  | `artist:${string}`;
type LibraryFilter = "all" | "playlists" | "albums" | "artists";
type RepeatMode = "off" | "all" | "one";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const gradients = [
  "linear-gradient(135deg, #6f45ff 0%, #c2f6df 100%)",
  "linear-gradient(135deg, #1ed760 0%, #0f8a6a 45%, #16231d 100%)",
  "linear-gradient(135deg, #f5ce62 0%, #e85a4f 54%, #222 100%)",
  "linear-gradient(135deg, #55d6ff 0%, #7b61ff 50%, #111 100%)",
  "linear-gradient(135deg, #ff7ab6 0%, #5f5fff 60%, #101010 100%)",
  "linear-gradient(135deg, #f7f1a3 0%, #36c486 52%, #0c0f0d 100%)",
  "linear-gradient(135deg, #f96d00 0%, #f2f2f2 45%, #222 100%)",
  "linear-gradient(135deg, #86efac 0%, #1d4ed8 100%)"
];
const accentColors = ["#477875", "#714f86", "#806f42", "#426d8c", "#7a5a4a", "#416d55", "#6b4f7d", "#5d6b42"];
const loadingMessages = [
  "Tuning the room before the first track lands.",
  "Dusting off album covers and lining up the queue.",
  "Finding the tiny groove between login and library.",
  "Warming up playlists, likes, and the good stuff.",
  "Checking the stage lights for your next song."
];
const spotifyLogoSrc = "/spotify-logo.jpeg";

function hashValue(value: string) {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}

function gradientFor(id: string) {
  return gradients[hashValue(id) % gradients.length];
}

function accentFor(id: string) {
  return accentColors[hashValue(id || "collection") % accentColors.length];
}

function collectionView(kind: "album" | "artist", value: string): ViewState {
  return `${kind}:${encodeURIComponent(value)}` as ViewState;
}

function collectionValue(view: ViewState, kind: "album" | "artist") {
  const prefix = `${kind}:`;

  if (!view.startsWith(prefix)) {
    return "";
  }

  return decodeURIComponent(view.slice(prefix.length));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeHexColor(color: string | null | undefined, fallback = "#1ed760") {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color!.toLowerCase() : fallback;
}

function hexToRgba(color: string, alpha: number) {
  const safeColor = safeHexColor(color).slice(1);
  const red = Number.parseInt(safeColor.slice(0, 2), 16);
  const green = Number.parseInt(safeColor.slice(2, 4), 16);
  const blue = Number.parseInt(safeColor.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function isMissingTrack(track: Track) {
  return Boolean(track.missing);
}

function newestFirst(tracks: Track[]) {
  return [...tracks].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function uniqueTracks(tracks: Track[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) {
      return false;
    }

    seen.add(track.id);
    return true;
  });
}

function isPodcastTrack(track: Track) {
  return [track.title, track.album, track.genre].some((value) => value.toLowerCase().includes("podcast"));
}

function trackMatchesQuery(track: Track, query: string) {
  return [track.title, track.artist, track.album, track.genre].some((value) => value.toLowerCase().includes(query));
}

function shuffledTracks(tracks: Track[]) {
  const shuffled = [...tracks];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function extractDominantColor(file: File) {
  return new Promise<string>((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 40;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        resolve("#1ed760");
        return;
      }

      context.drawImage(image, 0, 0, size, size);
      const { data } = context.getImageData(0, 0, size, size);
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;

      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;

        if (alpha < 128 || brightness < 34) {
          continue;
        }

        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
        count += 1;
      }

      URL.revokeObjectURL(objectUrl);

      if (!count) {
        resolve("#1ed760");
        return;
      }

      const toHex = (value: number) => Math.round(value / count).toString(16).padStart(2, "0");
      resolve(`#${toHex(red)}${toHex(green)}${toHex(blue)}`);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve("#1ed760");
    };

    image.src = objectUrl;
  });
}

function loadFollowedArtists(userId: string) {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const saved = window.localStorage.getItem(`spotify:followed-artists:${userId}`);
    const names = saved ? (JSON.parse(saved) as string[]) : [];
    return new Set(names.filter((name) => typeof name === "string"));
  } catch {
    return new Set<string>();
  }
}

function loadIdList(key: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const saved = window.localStorage.getItem(key);
    const ids = saved ? (JSON.parse(saved) as unknown[]) : [];
    return ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function saveIdList(key: string, ids: string[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(ids));
  }
}

type ArtworkProps = {
  track?: Track | null;
  size?: "sm" | "md" | "lg" | "hero";
  circle?: boolean;
  liked?: boolean;
};

function Artwork({ track, size = "md", circle = false, liked = false }: ArtworkProps) {
  const style = { background: liked ? gradients[0] : gradientFor(track?.id || "empty") };

  return (
    <div className={`artwork artwork-${size} ${circle ? "circle" : ""}`} style={style}>
      {track?.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={mediaUrl(track.coverUrl) || ""} />
      ) : liked ? (
        <Heart fill="currentColor" size={size === "hero" ? 74 : 26} />
      ) : (
        <Music2 size={size === "hero" ? 74 : 26} />
      )}
    </div>
  );
}

function SpotifyLogo({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" className={`spotify-logo ${className}`} src={spotifyLogoSrc} />;
}

function SplashLogo() {
  return <Music2 size={42} />;
}

type PlaylistArtworkProps = {
  add?: boolean;
  hero?: boolean;
  playlist?: Playlist | null;
};

function PlaylistArtwork({ add = false, hero = false, playlist }: PlaylistArtworkProps) {
  const color = safeHexColor(playlist?.coverColor, "#1ed760");
  const style = {
    background: add
      ? "linear-gradient(135deg, #1ed760, #095a2e)"
      : `linear-gradient(135deg, ${hexToRgba(color, 0.95)}, ${hexToRgba(color, 0.26)} 52%, #141414)`
  };

  return (
    <div className={`${hero ? "collection-playlist-art" : "playlist-cover"} ${add ? "add-cover" : ""}`} style={style}>
      {playlist?.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={mediaUrl(playlist.coverUrl) || ""} />
      ) : add ? (
        <Upload size={hero ? 72 : 24} />
      ) : (
        <ListMusic size={hero ? 72 : 24} />
      )}
    </div>
  );
}

type IconButtonProps = {
  active?: boolean;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
};

function IconButton({ active, className = "", disabled, label, onClick, children }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${active ? "active" : ""} ${className}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function SpotifyApp() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uploadFileRef = useRef<HTMLInputElement | null>(null);
  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const playlistCoverFileRef = useRef<HTMLInputElement | null>(null);
  const selectedPlaylistCoverFileRef = useRef<HTMLInputElement | null>(null);
  const albumCoverFileRef = useRef<HTMLInputElement | null>(null);
  const artistCoverFileRef = useRef<HTMLInputElement | null>(null);
  const mobileDetailsDragStart = useRef<number | null>(null);
  const [booting, setBooting] = useState(true);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [view, setView] = useState<ViewState>("home");
  const [lastView, setLastView] = useState<ViewState | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Track[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playbackList, setPlaybackList] = useState<Track[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [manualQueue, setManualQueue] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [volume, setVolume] = useState(0.78);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTargetPlaylistId, setUploadTargetPlaylistId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistSaving, setPlaylistSaving] = useState(false);
  const [playlistCoverSaving, setPlaylistCoverSaving] = useState(false);
  const [albumCoverSaving, setAlbumCoverSaving] = useState(false);
  const [artistCoverSaving, setArtistCoverSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [detailsMenuOpen, setDetailsMenuOpen] = useState(false);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [mobileNowOpen, setMobileNowOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [isMobileView, setIsMobileView] = useState(false);
  const [recentPlayedIds, setRecentPlayedIds] = useState<string[]>([]);
  const [recentPlaylistIds, setRecentPlaylistIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches
  );
  const [toast, setToast] = useState("");
  const [libraryWidth, setLibraryWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 330;
    }

    return clamp(Number(window.localStorage.getItem("spotify:library-width")) || 330, 240, 520);
  });
  const [nowPanelWidth, setNowPanelWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 380;
    }

    return clamp(Number(window.localStorage.getItem("spotify:now-width")) || 380, 300, 520);
  });
  const [followedArtists, setFollowedArtists] = useState<Set<string>>(() => new Set());
  const [uploadForm, setUploadForm] = useState({
    title: "",
    artist: "",
    album: "",
    genre: "Uploaded",
    duration: 0,
    audioName: "",
    coverName: ""
  });
  const [playlistForm, setPlaylistForm] = useState({
    name: "",
    description: "",
    coverName: "",
    coverColor: "#1ed760",
    isPublic: false
  });

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const activateUser = useCallback((nextUser: AppUser) => {
    setFollowedArtists(loadFollowedArtists(nextUser.id));
    setRecentPlayedIds(loadIdList(`spotify:recent-tracks:${nextUser.id}`).slice(0, 12));
    setRecentPlaylistIds(loadIdList(`spotify:recent-playlists:${nextUser.id}`).slice(0, 8));
    setUser(nextUser);
  }, []);

  const resetHomeView = useCallback(() => {
    setView("home");
    setLastView(null);
    setSearch("");
    setSearchResults(null);
    setSearchLoading(false);
    setLibraryFilter("all");
    setMobileLibraryOpen(false);
    setDetailsOpen(true);
    setDetailsMenuOpen(false);
    setMobileNowOpen(false);
    setProfileOpen(false);
    setQueueOpen(false);
    setActivityOpen(false);
    setFriendsOpen(false);
    setUploadOpen(false);
    setPlaylistOpen(false);
    setUploadTargetPlaylistId(null);
  }, []);

  const handleHomeButton = useCallback(() => {
    resetHomeView();
    setCurrentTrack(null);
    setPlaybackList([]);
    setPlaybackIndex(0);
    setManualQueue([]);
    setIsPlaying(false);
    setCurrentTime(0);
    setLoadedDuration(0);
  }, [resetHomeView]);

  const openMobileLibrary = useCallback(() => {
    setMobileLibraryOpen(true);
    setMobileNowOpen(false);
    setProfileOpen(false);
    setQueueOpen(false);
    setActivityOpen(false);
    setFriendsOpen(false);
  }, []);

  const selectView = useCallback((nextView: ViewState) => {
    setLastView(view);
    setView(nextView);
    setSearch("");
    setSearchResults(null);
    setSearchLoading(false);
    setMobileLibraryOpen(false);
    setMobileNowOpen(false);

    if (nextView.startsWith("playlist:") && user) {
      const playlistId = nextView.slice("playlist:".length);
      setRecentPlaylistIds((existing) => {
        const next = [playlistId, ...existing.filter((id) => id !== playlistId)].slice(0, 8);
        saveIdList(`spotify:recent-playlists:${user.id}`, next);
        return next;
      });
    }
  }, [user, view]);

  const openUpload = useCallback((playlistId?: string | null) => {
    setUploadTargetPlaylistId(playlistId || null);
    setUploadOpen(true);
  }, []);

  const closeUpload = useCallback(() => {
    setUploadOpen(false);
    setUploadTargetPlaylistId(null);
  }, []);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);

    try {
      const [trackResult, playlistResult] = await Promise.all([
        apiFetch("/api/tracks", { cache: "no-store" }),
        apiFetch("/api/playlists", { cache: "no-store" })
      ]);

      if (trackResult.ok) {
        const data = await trackResult.json();
        setTracks(data.tracks || []);
      }

      if (playlistResult.ok) {
        const data = await playlistResult.json();
        setPlaylists(data.playlists || []);
      }
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);

    try {
      const result = await apiFetch("/api/notifications", { cache: "no-store" });
      const data = await result.json().catch(() => ({}));

      if (!result.ok) {
        showToast(data.error || "Could not load notifications.");
        return;
      }

      setNotifications(data.notifications || []);
    } finally {
      setNotificationsLoading(false);
    }
  }, [showToast]);

  const openNotifications = useCallback(() => {
    setActivityOpen(true);
    setProfileOpen(false);
    loadNotifications().catch(() => showToast("Could not load notifications."));
  }, [loadNotifications, showToast]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setIsInstalled(false);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!booting) {
      return;
    }

    const timer = window.setInterval(
      () => setLoadingMessageIndex((index) => (index + 1) % loadingMessages.length),
      1700
    );

    return () => window.clearInterval(timer);
  }, [booting]);

  useEffect(() => {
    let active = true;

    apiFetch("/api/auth/me", { cache: "no-store" })
      .then(async (result) => {
        if (!active) {
          return;
        }

        if (result.ok) {
          const data = await result.json();
          activateUser(data.user);
          loadLibrary().catch(() => showToast("Could not refresh the library."));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setBooting(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activateUser, loadLibrary, showToast]);

  useEffect(() => {
    window.localStorage.setItem("spotify:library-width", String(libraryWidth));
  }, [libraryWidth]);

  useEffect(() => {
    window.localStorage.setItem("spotify:now-width", String(nowPanelWidth));
  }, [nowPanelWidth]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 980px)");
    const updateViewport = () => setIsMobileView(query.matches);

    updateViewport();
    query.addEventListener("change", updateViewport);

    return () => query.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = repeatMode === "one";
    }
  }, [repeatMode]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !currentTrack) {
      return;
    }

    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (!currentTrack) {
      return;
    }

    apiFetch(`/api/tracks/${currentTrack.id}/play`, { method: "POST" }).catch(() => undefined);
  }, [currentTrack]);

  const likedTracks = useMemo(() => tracks.filter((track) => track.liked), [tracks]);

  const filteredTracks = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return newestFirst(tracks);
    }

    return newestFirst(tracks.filter((track) => trackMatchesQuery(track, query)));
  }, [search, tracks]);

  useEffect(() => {
    const query = search.trim();

    if (!query || !user) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);

      try {
        const result = await apiFetch(`/api/tracks?search=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal
        });

        if (!result.ok) {
          setSearchResults([]);
          return;
        }

        const data = await result.json();
        const nextTracks = data.tracks || [];
        setSearchResults(nextTracks);
        setTracks((existing) => uniqueTracks([...nextTracks, ...existing]));
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 240);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [search, user]);

  const selectedPlaylistId = view.startsWith("playlist:") ? view.slice("playlist:".length) : "";
  const selectedAlbumName = collectionValue(view, "album");
  const selectedArtistName = collectionValue(view, "artist");

  const selectedPlaylist = useMemo(() => {
    if (!selectedPlaylistId) {
      return null;
    }

    return playlists.find((playlist) => playlist.id === selectedPlaylistId) || null;
  }, [playlists, selectedPlaylistId]);

  useEffect(() => {
    if (!selectedPlaylistId) {
      return;
    }

    let active = true;

    apiFetch(`/api/playlists/${selectedPlaylistId}`, { cache: "no-store" })
      .then(async (result) => {
        if (!active || !result.ok) {
          return;
        }

        const data = await result.json();
        const playlist = data.playlist as Playlist;

        setPlaylists((existing) =>
          existing.map((item) => (item.id === playlist.id ? { ...item, ...playlist } : item))
        );

        const playlistTracks = (playlist.tracks || []).filter((track) => !isMissingTrack(track));

        if (playlistTracks.length) {
          setTracks((existing) => uniqueTracks([...playlistTracks, ...existing]));
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [selectedPlaylistId]);

  const selectedPlaylistTracks = useMemo(() => {
    if (!selectedPlaylist) {
      return [];
    }

    if (selectedPlaylist.tracks?.length) {
      return selectedPlaylist.trackIds
        .map((id) => selectedPlaylist.tracks?.find((track) => track.id === id) || tracks.find((track) => track.id === id))
        .filter((track): track is Track => Boolean(track));
    }

    return selectedPlaylist.trackIds
      .map((id) => tracks.find((track) => track.id === id))
      .filter((track): track is Track => Boolean(track));
  }, [selectedPlaylist, tracks]);

  const allTracks = useMemo(() => newestFirst(tracks), [tracks]);
  const selectedAlbumTracks = useMemo(
    () => (selectedAlbumName ? allTracks.filter((track) => track.album === selectedAlbumName) : []),
    [allTracks, selectedAlbumName]
  );
  const selectedArtistTracks = useMemo(
    () => (selectedArtistName ? allTracks.filter((track) => track.artist === selectedArtistName) : []),
    [allTracks, selectedArtistName]
  );
  const libraryAlbums = useMemo(() => {
    const albums = new Map<string, Track[]>();

    allTracks.forEach((track) => {
      const album = track.album || "Single";
      albums.set(album, [...(albums.get(album) || []), track]);
    });

    return [...albums.entries()]
      .map(([name, albumTracks]) => ({ name, tracks: albumTracks, cover: albumTracks[0] }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [allTracks]);
  const libraryArtists = useMemo(() => {
    const artists = new Map<string, Track[]>();

    allTracks.forEach((track) => {
      const artist = track.artist || "Unknown Artist";
      artists.set(artist, [...(artists.get(artist) || []), track]);
    });

    return [...artists.entries()]
      .map(([name, artistTracks]) => ({ name, tracks: artistTracks, cover: artistTracks[0] }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [allTracks]);
  const ownPlaylists = useMemo(
    () => playlists.filter((playlist) => playlist.ownerId === user?.id),
    [playlists, user?.id]
  );
  const selectedPlaylistOwned = Boolean(selectedPlaylist && selectedPlaylist.ownerId === user?.id);
  const libraryQuery = librarySearch.trim().toLowerCase();
  const visiblePlaylists = useMemo(
    () =>
      playlists.filter((playlist) =>
        !libraryQuery ||
        [playlist.name, playlist.description, playlist.ownerName, playlist.isPublic ? "public" : "private"].some(
          (value) => value.toLowerCase().includes(libraryQuery)
        )
      ),
    [libraryQuery, playlists]
  );
  const visibleLibraryAlbums = useMemo(
    () =>
      libraryAlbums.filter(
        (album) =>
          !libraryQuery ||
          [album.name, ...album.tracks.flatMap((track) => [track.artist, track.title])].some((value) =>
            value.toLowerCase().includes(libraryQuery)
          )
      ),
    [libraryAlbums, libraryQuery]
  );
  const visibleLibraryArtists = useMemo(
    () =>
      libraryArtists.filter(
        (artist) =>
          !libraryQuery ||
          [artist.name, ...artist.tracks.map((track) => track.title)].some((value) =>
            value.toLowerCase().includes(libraryQuery)
          )
      ),
    [libraryArtists, libraryQuery]
  );
  const podcastTracks = useMemo(() => allTracks.filter(isPodcastTrack), [allTracks]);
  const allTopTracks = useMemo(() => [...tracks].sort((a, b) => b.plays - a.plays), [tracks]);
  const scopedSearchBase = useMemo(() => {
    if (selectedPlaylist) {
      return selectedPlaylistTracks;
    }

    if (selectedAlbumName) {
      return selectedAlbumTracks;
    }

    if (selectedArtistName) {
      return selectedArtistTracks;
    }

    if (view === "liked") {
      return likedTracks;
    }

    if (view === "songs" || view === "recent") {
      return allTracks;
    }

    if (view === "podcasts") {
      return podcastTracks;
    }

    if (view === "most") {
      return allTopTracks;
    }

    return null;
  }, [
    allTopTracks,
    allTracks,
    likedTracks,
    podcastTracks,
    selectedAlbumName,
    selectedAlbumTracks,
    selectedArtistName,
    selectedArtistTracks,
    selectedPlaylist,
    selectedPlaylistTracks,
    view
  ]);
  const searchTracks = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return filteredTracks;
    }

    if (scopedSearchBase) {
      return newestFirst(scopedSearchBase.filter((track) => trackMatchesQuery(track, query)));
    }

    return searchResults ?? filteredTracks;
  }, [filteredTracks, scopedSearchBase, search, searchResults]);

  const activeTracks = useMemo(() => {
    if (search.trim()) {
      return searchTracks;
    }

    if (view === "liked") {
      return likedTracks;
    }

    if (view === "songs") {
      return allTracks;
    }

    if (view === "podcasts") {
      return podcastTracks;
    }

    if (view === "recent") {
      return allTracks;
    }

    if (view === "most") {
      return allTopTracks;
    }

    if (selectedPlaylist) {
      return selectedPlaylistTracks;
    }

    if (selectedAlbumName) {
      return selectedAlbumTracks;
    }

    if (selectedArtistName) {
      return selectedArtistTracks;
    }

    return filteredTracks;
  }, [
    allTopTracks,
    allTracks,
    filteredTracks,
    likedTracks,
    podcastTracks,
    search,
    searchTracks,
    selectedAlbumName,
    selectedAlbumTracks,
    selectedArtistName,
    selectedArtistTracks,
    selectedPlaylist,
    selectedPlaylistTracks,
    view
  ]);
  const playableActiveTracks = useMemo(() => activeTracks.filter((track) => !isMissingTrack(track)), [activeTracks]);

  const recentTracks = useMemo(() => allTracks.slice(0, 12), [allTracks]);
  const topTracks = useMemo(() => allTopTracks.slice(0, 12), [allTopTracks]);
  const uploadedMix = useMemo(() => uniqueTracks([...likedTracks, ...topTracks, ...recentTracks]).slice(0, 12), [
    likedTracks,
    recentTracks,
    topTracks
  ]);
  const recentlyPlayedTracks = useMemo(() => {
    const ordered = recentPlayedIds
      .map((id) => tracks.find((track) => track.id === id))
      .filter((track): track is Track => Boolean(track));

    return ordered.length ? ordered : recentTracks;
  }, [recentPlayedIds, recentTracks, tracks]);
  const recentLibraryPlaylists = useMemo(
    () =>
      recentPlaylistIds
        .map((id) => playlists.find((playlist) => playlist.id === id))
        .filter((playlist): playlist is Playlist => Boolean(playlist)),
    [playlists, recentPlaylistIds]
  );
  const followedLibraryArtists = useMemo(
    () => libraryArtists.filter((artist) => followedArtists.has(artist.name.trim().toLowerCase())),
    [followedArtists, libraryArtists]
  );
  const homeQuickTracks = recentlyPlayedTracks.slice(0, isMobileView ? 2 : 4);
  const homeJumpTracks = uploadedMix.slice(0, isMobileView ? 1 : 3);
  const homeRecentTracks = recentlyPlayedTracks.slice(0, isMobileView ? 1 : 3);
  const homeTopTracks = topTracks.slice(0, isMobileView ? 1 : 3);

  const nextQueueTracks = useMemo(() => {
    const fromPlayback = playbackList.slice(playbackIndex + 1, playbackIndex + 6);
    return uniqueTracks([...manualQueue, ...fromPlayback]).slice(0, 8);
  }, [manualQueue, playbackIndex, playbackList]);

  const totalDuration = currentTrack?.duration || loadedDuration;

  const updateTrackEverywhere = useCallback((trackId: string, update: (track: Track) => Track) => {
    setTracks((existing) => existing.map((track) => (track.id === trackId ? update(track) : track)));
    setPlaylists((existing) =>
      existing.map((playlist) => ({
        ...playlist,
        tracks: playlist.tracks?.map((track) => (track.id === trackId ? update(track) : track))
      }))
    );
    setPlaybackList((existing) => existing.map((track) => (track.id === trackId ? update(track) : track)));
    setManualQueue((existing) => existing.map((track) => (track.id === trackId ? update(track) : track)));
    setCurrentTrack((track) => (track?.id === trackId ? update(track) : track));
  }, []);

  const mergeTracksEverywhere = useCallback((updatedTracks: Track[]) => {
    const updatedById = new Map(updatedTracks.map((track) => [track.id, track]));

    setTracks((existing) => existing.map((track) => updatedById.get(track.id) || track));
    setPlaylists((existing) =>
      existing.map((playlist) => ({
        ...playlist,
        tracks: playlist.tracks?.map((track) => updatedById.get(track.id) || track)
      }))
    );
    setPlaybackList((existing) => existing.map((track) => updatedById.get(track.id) || track));
    setManualQueue((existing) => existing.map((track) => updatedById.get(track.id) || track));
    setCurrentTrack((track) => (track ? updatedById.get(track.id) || track : track));
  }, []);

  const playTrack = useCallback((track: Track, source: Track[] = activeTracks) => {
    if (isMissingTrack(track)) {
      showToast("This song was already removed. Use delete to clean it from playlists.");
      return;
    }

    const list = source.length ? source : [track];
    const index = Math.max(0, list.findIndex((item) => item.id === track.id));

    if (user) {
      setRecentPlayedIds((existing) => {
        const next = [track.id, ...existing.filter((id) => id !== track.id)].slice(0, 12);
        saveIdList(`spotify:recent-tracks:${user.id}`, next);
        return next;
      });
    }

    setPlaybackList(list);
    setPlaybackIndex(index);
    setCurrentTrack(track);
    setLoadedDuration(track.duration || 0);
    setCurrentTime(0);
    setIsPlaying(true);
  }, [activeTracks, showToast, user]);

  const playShuffled = useCallback(
    (source: Track[] = activeTracks) => {
      const list = shuffledTracks(source);

      if (!list.length) {
        return;
      }

      setShuffleOn(true);
      playTrack(list[0], list);
    },
    [activeTracks, playTrack]
  );

  const playFromManualQueue = useCallback((queue: Track[]) => {
    const [next, ...remaining] = queue;

    if (!next) {
      return false;
    }

    setManualQueue(remaining);
    setCurrentTrack(next);
    setPlaybackList((existing) => (existing.length ? existing : [next]));
    setPlaybackIndex(0);
    setLoadedDuration(next.duration || 0);
    setCurrentTime(0);
    setIsPlaying(true);
    return true;
  }, []);

  const playNext = useCallback(() => {
    if (manualQueue.length && playFromManualQueue(manualQueue)) {
      return;
    }

    if (!playbackList.length) {
      if (tracks[0]) {
        playTrack(tracks[0], tracks);
      }
      return;
    }

    if (shuffleOn && playbackList.length > 1) {
      const choices = playbackList.map((_, index) => index).filter((index) => index !== playbackIndex);
      const nextIndex = choices[Math.floor(Math.random() * choices.length)] ?? 0;
      const next = playbackList[nextIndex];
      setPlaybackIndex(nextIndex);
      setCurrentTrack(next);
      setLoadedDuration(next.duration || 0);
      setCurrentTime(0);
      setIsPlaying(true);
      return;
    }

    const nextIndex = playbackIndex + 1;

    if (nextIndex < playbackList.length) {
      const next = playbackList[nextIndex];
      setPlaybackIndex(nextIndex);
      setCurrentTrack(next);
      setLoadedDuration(next.duration || 0);
      setCurrentTime(0);
      setIsPlaying(true);
      return;
    }

    const fallbackList = playbackList.length ? playbackList : tracks;
    const next = fallbackList[0];

    if (next) {
      setPlaybackList(fallbackList);
      setPlaybackIndex(0);
      setCurrentTrack(next);
      setLoadedDuration(next.duration || 0);
      setCurrentTime(0);
      setIsPlaying(true);
    }
  }, [manualQueue, playFromManualQueue, playTrack, playbackIndex, playbackList, shuffleOn, tracks]);

  const playPrevious = useCallback(() => {
    const audio = audioRef.current;

    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const previousIndex = playbackIndex - 1;

    if (previousIndex >= 0) {
      const previous = playbackList[previousIndex];
      setPlaybackIndex(previousIndex);
      setCurrentTrack(previous);
      setLoadedDuration(previous.duration || 0);
      setCurrentTime(0);
      setIsPlaying(true);
    }
  }, [playbackIndex, playbackList]);

  const handleEnded = useCallback(() => {
    const audio = audioRef.current;

    if (repeatMode === "one" && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => undefined);
      return;
    }

    playNext();
  }, [playNext, repeatMode]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: [
        {
          src: mediaUrl(currentTrack.coverUrl) || spotifyLogoSrc,
          sizes: currentTrack.coverUrl ? "512x512" : "any",
          type: "image/jpeg"
        }
      ]
    });

    const seekBy = (seconds: number) => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      audio.currentTime = Math.max(0, Math.min(audio.duration || totalDuration || 0, audio.currentTime + seconds));
      setCurrentTime(audio.currentTime);
    };

    navigator.mediaSession.setActionHandler("play", () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler("previoustrack", playPrevious);
    navigator.mediaSession.setActionHandler("nexttrack", playNext);
    navigator.mediaSession.setActionHandler("seekbackward", () => seekBy(-10));
    navigator.mediaSession.setActionHandler("seekforward", () => seekBy(10));
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      const audio = audioRef.current;

      if (!audio || typeof details.seekTime !== "number") {
        return;
      }

      audio.currentTime = details.seekTime;
      setCurrentTime(details.seekTime);
    });

    return () => {
      const actions: MediaSessionAction[] = [
        "play",
        "pause",
        "previoustrack",
        "nexttrack",
        "seekbackward",
        "seekforward",
        "seekto"
      ];

      actions.forEach((action) => navigator.mediaSession.setActionHandler(action, null));
    };
  }, [currentTrack, playNext, playPrevious, totalDuration]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.playbackState = currentTrack ? (isPlaying ? "playing" : "paused") : "none";

    if (currentTrack && totalDuration > 0 && "setPositionState" in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({
          duration: totalDuration,
          playbackRate: 1,
          position: Math.min(currentTime, totalDuration)
        });
      } catch {
        // Some Android browsers are picky about duration/position values.
      }
    }
  }, [currentTime, currentTrack, isPlaying, totalDuration]);

  const toggleLike = useCallback(
    async (track: Track) => {
      if (isMissingTrack(track)) {
        showToast("This deleted song cannot be liked.");
        return;
      }

      const nextLiked = !track.liked;
      updateTrackEverywhere(track.id, (item) => ({ ...item, liked: nextLiked }));

      const result = await apiFetch(`/api/library/likes/${track.id}`, {
        method: nextLiked ? "POST" : "DELETE"
      });

      if (!result.ok) {
        updateTrackEverywhere(track.id, (item) => ({ ...item, liked: track.liked }));
        showToast("Could not update liked songs.");
      }
    },
    [showToast, updateTrackEverywhere]
  );

  const deleteTrack = useCallback(
    async (track: Track) => {
      if (!window.confirm(`Delete "${track.title}" from the library?`)) {
        return;
      }

      const result = await apiFetch(`/api/tracks/${track.id}`, { method: "DELETE" });
      const data = await result.json().catch(() => ({}));

      if (!result.ok) {
        showToast(data.error || "Could not delete song.");
        return;
      }

      setTracks((existing) => existing.filter((item) => item.id !== track.id));
      setPlaylists((existing) =>
        existing.map((playlist) => ({
          ...playlist,
          trackIds: playlist.trackIds.filter((id) => id !== track.id),
          tracks: playlist.tracks?.filter((item) => item.id !== track.id)
        }))
      );
      setRecentPlayedIds((existing) => {
        const next = existing.filter((id) => id !== track.id);

        if (user) {
          saveIdList(`spotify:recent-tracks:${user.id}`, next);
        }

        return next;
      });
      setManualQueue((existing) => existing.filter((item) => item.id !== track.id));
      setPlaybackList((existing) => existing.filter((item) => item.id !== track.id));
      setPlaybackIndex(0);

      if (currentTrack?.id === track.id) {
        setCurrentTrack(null);
        setIsPlaying(false);
        setCurrentTime(0);
      }

      showToast(`Deleted "${track.title}".`);
    },
    [currentTrack, showToast, user]
  );

  const addToQueue = useCallback(
    (track: Track) => {
      if (isMissingTrack(track)) {
        showToast("This deleted song cannot be queued.");
        return;
      }

      setManualQueue((existing) => [...existing, track]);
      setQueueOpen(true);
      showToast(`Added "${track.title}" to queue.`);
    },
    [showToast]
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, track: Track) => {
      if (!playlistId || isMissingTrack(track)) {
        return;
      }

      const result = await apiFetch(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id })
      });

      if (!result.ok) {
        showToast("Could not add to playlist.");
        return;
      }

      setPlaylists((existing) =>
        existing.map((playlist) =>
          playlist.id === playlistId && !playlist.trackIds.includes(track.id)
            ? {
                ...playlist,
                trackIds: [...playlist.trackIds, track.id],
                tracks: playlist.tracks ? uniqueTracks([...playlist.tracks, track]) : playlist.tracks
              }
            : playlist
        )
      );
      showToast(`Added to ${playlists.find((playlist) => playlist.id === playlistId)?.name || "playlist"}.`);
    },
    [playlists, showToast]
  );

  const removeFromPlaylist = useCallback(
    async (track: Track) => {
      if (!selectedPlaylist) {
        return;
      }

      const result = await apiFetch(`/api/playlists/${selectedPlaylist.id}/tracks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id })
      });

      if (!result.ok) {
        showToast("Could not remove from playlist.");
        return;
      }

      setPlaylists((existing) =>
        existing.map((playlist) =>
          playlist.id === selectedPlaylist.id
            ? {
                ...playlist,
                trackIds: playlist.trackIds.filter((id) => id !== track.id),
                tracks: playlist.tracks?.filter((item) => item.id !== track.id)
              }
            : playlist
        )
      );
      showToast(`Removed "${track.title}" from ${selectedPlaylist.name}.`);
    },
    [selectedPlaylist, showToast]
  );

  const canDeleteTrack = useCallback(
    () => Boolean(user),
    [user]
  );

  const beginLibraryResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = libraryWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setLibraryWidth(clamp(startWidth + moveEvent.clientX - startX, 240, 520));
      };

      const handlePointerUp = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [libraryWidth]
  );

  const beginNowResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = nowPanelWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setNowPanelWidth(clamp(startWidth - (moveEvent.clientX - startX), 300, 520));
      };

      const handlePointerUp = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [nowPanelWidth]
  );

  const toggleFollow = useCallback(
    (artistName: string) => {
      const name = artistName.trim();

      if (!name || !user) {
        return;
      }

      const key = name.toLowerCase();
      const next = new Set(followedArtists);
      const wasFollowing = next.has(key);

      if (wasFollowing) {
        next.delete(key);
      } else {
        next.add(key);
      }

      setFollowedArtists(next);
      window.localStorage.setItem(`spotify:followed-artists:${user.id}`, JSON.stringify([...next]));
      showToast(wasFollowing ? `Unfollowed ${name}.` : `Following ${name}.`);
    },
    [followedArtists, showToast, user]
  );

  const isFollowing = useCallback(
    (artistName: string) => followedArtists.has(artistName.trim().toLowerCase()),
    [followedArtists]
  );

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Local session cleanup should still happen if the network request fails.
    } finally {
      clearSessionToken();
      setUser(null);
      setCurrentTrack(null);
      setIsPlaying(false);
      setTracks([]);
      setPlaylists([]);
      setView("home");
      setSearch("");
      setSearchResults(null);
      setSearchLoading(false);
      setLibraryFilter("all");
      setLibrarySearch("");
      setUploadTargetPlaylistId(null);
      setFollowedArtists(new Set());
      setRecentPlayedIds([]);
      setRecentPlaylistIds([]);
      setNotifications([]);
      setProfileOpen(false);
      setQueueOpen(false);
      setMobileNowOpen(false);
    }
  }

  async function handleInstallApp() {
    if (isInstalled) {
      showToast("The app is already installed.");
      return;
    }

    if (!installPrompt) {
      showToast("Use your browser menu to install this app.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      showToast("spotify installed.");
    } else {
      showToast("Install dismissed.");
    }
  }

  async function handleCreatePlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!playlistForm.name.trim()) {
      return;
    }

    const formData = new FormData();
    formData.append("name", playlistForm.name);
    formData.append("description", playlistForm.description);
    formData.append("coverColor", playlistForm.coverColor);
    formData.append("isPublic", String(playlistForm.isPublic));

    const cover = playlistCoverFileRef.current?.files?.[0];

    if (cover) {
      formData.append("cover", cover);
    }

    setPlaylistSaving(true);

    try {
      const result = await apiFetch("/api/playlists", {
        method: "POST",
        body: formData
      });
      const data = await result.json();

      if (!result.ok) {
        showToast(data.error || "Could not create playlist.");
        return;
      }

      setPlaylists((existing) => [data.playlist, ...existing]);
      setPlaylistOpen(false);
      setPlaylistForm({ name: "", description: "", coverName: "", coverColor: "#1ed760", isPublic: false });
      if (playlistCoverFileRef.current) {
        playlistCoverFileRef.current.value = "";
      }
      selectView(`playlist:${data.playlist.id}`);
    } catch (error) {
      showToast((error as Error).message);
    } finally {
      setPlaylistSaving(false);
    }
  }

  function handleAudioFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadForm((existing) => ({
      ...existing,
      audioName: file.name,
      title: existing.title || file.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ")
    }));

    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      setUploadForm((existing) => ({
        ...existing,
        duration: Number.isFinite(audio.duration) ? Math.round(audio.duration) : existing.duration
      }));
      URL.revokeObjectURL(audio.src);
    };
    audio.src = URL.createObjectURL(file);
  }

  function handleCoverFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      setUploadForm((existing) => ({ ...existing, coverName: file.name }));
    }
  }

  function handlePlaylistCoverFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setPlaylistForm((existing) => ({ ...existing, coverName: file.name }));
    extractDominantColor(file).then((coverColor) =>
      setPlaylistForm((existing) => ({ ...existing, coverColor }))
    );
  }

  async function handleSelectedPlaylistCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !selectedPlaylist) {
      return;
    }

    setPlaylistCoverSaving(true);

    try {
      const coverColor = await extractDominantColor(file);
      const formData = new FormData();
      formData.append("cover", file);
      formData.append("coverColor", coverColor);

      const result = await apiFetch(`/api/playlists/${selectedPlaylist.id}`, {
        method: "PATCH",
        body: formData
      });
      const data = await result.json();

      if (!result.ok) {
        throw new Error(data.error || "Could not update playlist cover.");
      }

      setPlaylists((existing) =>
        existing.map((playlist) =>
          playlist.id === data.playlist.id ? { ...playlist, ...data.playlist } : playlist
        )
      );
      showToast("Playlist cover updated.");
    } catch (error) {
      showToast((error as Error).message);
    } finally {
      setPlaylistCoverSaving(false);
      if (selectedPlaylistCoverFileRef.current) {
        selectedPlaylistCoverFileRef.current.value = "";
      }
    }
  }

  async function handleAlbumCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !selectedAlbumName) {
      return;
    }

    setAlbumCoverSaving(true);

    try {
      const formData = new FormData();
      formData.append("album", selectedAlbumName);
      formData.append("cover", file);

      const result = await apiFetch("/api/albums/cover", {
        method: "PATCH",
        body: formData
      });
      const data = await result.json();

      if (!result.ok) {
        throw new Error(data.error || "Could not update album cover.");
      }

      mergeTracksEverywhere(data.tracks || []);
      showToast("Album cover updated.");
    } catch (error) {
      showToast((error as Error).message);
    } finally {
      setAlbumCoverSaving(false);
      if (albumCoverFileRef.current) {
        albumCoverFileRef.current.value = "";
      }
    }
  }

  async function handleArtistCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !selectedArtistName) {
      return;
    }

    setArtistCoverSaving(true);

    try {
      const formData = new FormData();
      formData.append("artist", selectedArtistName);
      formData.append("cover", file);

      const result = await apiFetch("/api/artists/cover", {
        method: "PATCH",
        body: formData
      });
      const data = await result.json();

      if (!result.ok) {
        throw new Error(data.error || "Could not update artist cover.");
      }

      mergeTracksEverywhere(data.tracks || []);
      showToast("Artist cover updated.");
    } catch (error) {
      showToast((error as Error).message);
    } finally {
      setArtistCoverSaving(false);
      if (artistCoverFileRef.current) {
        artistCoverFileRef.current.value = "";
      }
    }
  }

  async function handlePlaylistVisibility(isPublic: boolean) {
    if (!selectedPlaylist || !selectedPlaylistOwned) {
      return;
    }

    const result = await apiFetch(`/api/playlists/${selectedPlaylist.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic })
    });
    const data = await result.json().catch(() => ({}));

    if (!result.ok) {
      showToast(data.error || "Could not update playlist visibility.");
      return;
    }

    setPlaylists((existing) =>
      existing.map((playlist) => (playlist.id === data.playlist.id ? { ...playlist, ...data.playlist } : playlist))
    );
    showToast(isPublic ? "Playlist is public." : "Playlist is private.");
  }

  async function handleDeletePlaylist() {
    if (!selectedPlaylist || !selectedPlaylistOwned) {
      return;
    }

    if (!window.confirm(`Delete "${selectedPlaylist.name}"? Songs will stay in the library.`)) {
      return;
    }

    const result = await apiFetch(`/api/playlists/${selectedPlaylist.id}`, { method: "DELETE" });
    const data = await result.json().catch(() => ({}));

    if (!result.ok) {
      showToast(data.error || "Could not delete playlist.");
      return;
    }

    setPlaylists((existing) => existing.filter((playlist) => playlist.id !== selectedPlaylist.id));
    resetHomeView();
    showToast(`Deleted "${selectedPlaylist.name}".`);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const audio = uploadFileRef.current?.files?.[0];
    const cover = coverFileRef.current?.files?.[0];

    if (!audio) {
      showToast("Choose an audio file first.");
      return;
    }

    const formData = new FormData();
    formData.append("audio", audio);

    if (cover) {
      formData.append("cover", cover);
    }

    if (uploadTargetPlaylistId) {
      formData.append("playlistId", uploadTargetPlaylistId);
    }

    Object.entries(uploadForm).forEach(([key, value]) => {
      if (!["audioName", "coverName"].includes(key)) {
        formData.append(key, String(value));
      }
    });

    setUploading(true);

    try {
      const result = await apiFetch("/api/tracks", {
        method: "POST",
        body: formData
      });
      const data = await result.json();

      if (!result.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setTracks((existing) => uniqueTracks([data.track, ...existing]));

      if (uploadTargetPlaylistId) {
        setPlaylists((existing) =>
          existing.map((playlist) =>
            playlist.id === uploadTargetPlaylistId && !playlist.trackIds.includes(data.track.id)
              ? {
                  ...playlist,
                  trackIds: [...playlist.trackIds, data.track.id],
                  tracks: playlist.tracks ? uniqueTracks([...playlist.tracks, data.track]) : playlist.tracks
                }
              : playlist
          )
        );
      }

      closeUpload();
      setUploadForm({
        title: "",
        artist: "",
        album: "",
        genre: "Uploaded",
        duration: 0,
        audioName: "",
        coverName: ""
      });

      if (uploadFileRef.current) {
        uploadFileRef.current.value = "";
      }

      if (coverFileRef.current) {
        coverFileRef.current.value = "";
      }

      showToast(uploadTargetPlaylistId ? "Song uploaded and added to this playlist." : "Song uploaded to MongoDB.");
    } catch (error) {
      showToast((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function cycleRepeat() {
    setRepeatMode((current) => (current === "off" ? "all" : current === "all" ? "one" : "off"));
  }

  function handleBackNavigation() {
    setSearch("");
    setSearchResults(null);
    setSearchLoading(false);
    setMobileNowOpen(false);
    setMobileLibraryOpen(false);

    if (lastView && lastView !== view) {
      setView(lastView);
      setLastView(null);
      return;
    }

    resetHomeView();
  }

  function beginMobileNowDrag(event: ReactPointerEvent<HTMLDivElement>) {
    mobileDetailsDragStart.current = event.clientY;
  }

  function moveMobileNowDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (mobileDetailsDragStart.current === null) {
      return;
    }

    if (event.clientY - mobileDetailsDragStart.current > 80) {
      setMobileNowOpen(false);
      mobileDetailsDragStart.current = null;
    }
  }

  function endMobileNowDrag() {
    mobileDetailsDragStart.current = null;
  }

  if (booting) {
    return (
      <main className="splash-screen">
        <div className="splash-mark">
          <SplashLogo />
        </div>
        <Loader2 className="spin" size={28} />
        <p className="splash-copy">{loadingMessages[loadingMessageIndex]}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(nextUser) => {
          activateUser(nextUser);
          loadLibrary().catch(() => showToast("Could not refresh the library."));
        }}
      />
    );
  }

  const activeTitle = search
    ? "Search results"
    : view === "liked"
      ? "Liked Songs"
      : view === "songs"
        ? "Songs"
        : view === "podcasts"
          ? "Podcasts"
          : view === "recent"
            ? "Recents"
            : view === "most"
              ? "Most played"
              : selectedPlaylist
                ? selectedPlaylist.name
                : selectedAlbumName
                  ? selectedAlbumName
                  : selectedArtistName
                    ? selectedArtistName
                : "Home";
  const activeSubtitle = search
    ? searchLoading
      ? `Searching for "${search.trim()}"`
      : `${activeTracks.length} ${activeTracks.length === 1 ? "result" : "results"} for "${search.trim()}"`
    : view === "liked"
      ? `${likedTracks.length} liked ${likedTracks.length === 1 ? "song" : "songs"}`
      : view === "songs"
        ? `${allTracks.length} songs uploaded by the community`
        : view === "podcasts"
          ? `${podcastTracks.length} ${podcastTracks.length === 1 ? "podcast" : "podcasts"}`
          : view === "recent"
            ? `${allTracks.length} songs sorted by newest uploads`
            : view === "most"
              ? `${allTopTracks.length} songs sorted by play count`
              : selectedPlaylist
                ? `${selectedPlaylist.trackIds.length} songs by ${selectedPlaylist.ownerName}`
                : selectedAlbumName
                  ? `${selectedAlbumTracks.length} ${selectedAlbumTracks.length === 1 ? "song" : "songs"} from this album`
                  : selectedArtistName
                    ? `${selectedArtistTracks.length} ${selectedArtistTracks.length === 1 ? "song" : "songs"} by this artist`
                : `${tracks.length} songs uploaded by the community`;
  const activeKicker = search
    ? "Search"
    : selectedPlaylist || view === "liked"
      ? "Playlist"
      : selectedAlbumName
        ? "Album"
        : selectedArtistName
          ? "Artist"
          : "Collection";
  const collectionCoverTrack = selectedAlbumTracks[0] || selectedArtistTracks[0] || null;
  const compactCollectionIcon = Boolean(search || ["songs", "podcasts", "recent", "most"].includes(view));
  const collectionAccent = selectedPlaylist
    ? safeHexColor(selectedPlaylist.coverColor, "#477875")
    : view === "liked"
      ? "#6f45ff"
      : collectionCoverTrack
        ? accentFor(collectionCoverTrack.id)
        : search
          ? "#475569"
          : view === "podcasts"
            ? "#416d55"
            : "#477875";
  const collectionStyle = {
    "--collection-accent": collectionAccent,
    "--collection-accent-soft": hexToRgba(collectionAccent, compactCollectionIcon ? 0.22 : 0.48),
    "--collection-accent-mid": hexToRgba(collectionAccent, 0.22)
  } as CSSProperties;
  const gridStyle = {
    "--library-width": `${libraryWidth}px`,
    "--now-width": `${nowPanelWidth}px`
  } as CSSProperties;

  return (
    <main className={`spotify-shell ${mobileLibraryOpen ? "mobile-library-open" : ""} ${mobileNowOpen ? "mobile-now-open" : ""}`}>
      <audio
        onEnded={handleEnded}
        onLoadedMetadata={(event) => setLoadedDuration(event.currentTarget.duration || currentTrack?.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        playsInline
        preload="metadata"
        ref={audioRef}
        src={mediaUrl(currentTrack?.audioUrl) || undefined}
      />

      <header className="top-bar">
        <div className="window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <IconButton label="Home" onClick={handleHomeButton} active={view === "home" && !mobileLibraryOpen} className="home-button">
          <Home size={24} fill="currentColor" />
        </IconButton>

        <IconButton
          label="Open library"
          onClick={openMobileLibrary}
          active={mobileLibraryOpen}
          className="mobile-library-button"
        >
          <Library size={22} />
        </IconButton>

        {!isInstalled && (
          <IconButton label="Install" onClick={handleInstallApp} className="install-icon-button">
            <Download size={19} />
          </IconButton>
        )}

        <label className="search-box">
          <Search size={24} />
          <input
            onChange={(event) => {
              const nextSearch = event.target.value;
              setSearch(nextSearch);

              if (!nextSearch.trim()) {
                setSearchResults(null);
                setSearchLoading(false);
              }

              if (nextSearch.trim()) {
                setLastView(view);
              }

              if (view === "home") {
                setView("home");
              }
              setMobileLibraryOpen(false);
              setMobileNowOpen(false);
            }}
            placeholder={isMobileView ? "What to play?" : "What do you want to play?"}
            type="search"
            value={search}
          />
        </label>

        <button
          className="upload-top-button"
          onClick={() => openUpload(selectedPlaylistOwned ? selectedPlaylist?.id : null)}
          type="button"
        >
          <Upload size={18} />
          Add songs
        </button>

        <div className="top-actions">
          {!detailsOpen && currentTrack && (
            <IconButton label="Show now playing" onClick={() => setDetailsOpen(true)}>
              <Disc3 size={20} />
            </IconButton>
          )}
          <IconButton
            label="Notifications"
            onClick={openNotifications}
          >
            <Bell size={20} />
          </IconButton>
          <IconButton
            label="Friends"
            onClick={() => {
              setFriendsOpen(true);
              setProfileOpen(false);
            }}
          >
            <UserRound size={20} />
          </IconButton>
          <button
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            className={`avatar-button ${profileOpen ? "active" : ""}`}
            onClick={() => setProfileOpen((open) => !open)}
            title={user.email}
            type="button"
          >
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={user.picture} />
            ) : (
              user.name.slice(0, 1).toUpperCase()
            )}
          </button>
          {profileOpen && (
            <div className="profile-popover" role="menu">
              <div className="profile-summary">
                <button className="avatar-button large" title={user.email} type="button">
                  {user.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={user.picture} />
                  ) : (
                    user.name.slice(0, 1).toUpperCase()
                  )}
                </button>
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
              </div>
              <div className="profile-stats">
                <span>
                  <strong>{tracks.length}</strong>
                  <small>Songs</small>
                </span>
                <span>
                  <strong>{ownPlaylists.length}</strong>
                  <small>Playlists</small>
                </span>
                <span>
                  <strong>{likedTracks.length}</strong>
                  <small>Liked</small>
                </span>
              </div>
              <button onClick={handleInstallApp} role="menuitem" type="button">
                <Download size={18} />
                Install
              </button>
              <button
                onClick={() => openUpload(selectedPlaylistOwned ? selectedPlaylist?.id : null)}
                role="menuitem"
                type="button"
              >
                <Upload size={18} />
                Upload song
              </button>
              <button onClick={() => setPlaylistOpen(true)} role="menuitem" type="button">
                <Plus size={18} />
                Create playlist
              </button>
              <button onClick={handleLogout} role="menuitem" type="button">
                <LogOut size={18} />
                Log out
              </button>
            </div>
          )}
          <IconButton label="Log out" onClick={handleLogout}>
            <LogOut size={19} />
          </IconButton>
        </div>
      </header>

      <section className={`content-grid ${detailsOpen ? "" : "details-closed"}`} style={gridStyle}>
        <aside className="library-panel panel">
          <div className="panel-header">
            <div className="panel-title">
              <Library size={23} />
              <span>Your Library</span>
            </div>
            <div className="panel-actions">
              <IconButton label="Create playlist" onClick={() => setPlaylistOpen(true)}>
                <Plus size={22} />
              </IconButton>
              <IconButton
                label="Expand library"
                onClick={() => setLibraryWidth((width) => (width < 420 ? 520 : 330))}
              >
                <Maximize2 size={17} />
              </IconButton>
            </div>
          </div>

          <div className="library-chips">
            <button
              className={libraryFilter === "playlists" ? "active" : ""}
              type="button"
              onClick={() => setLibraryFilter((filter) => (filter === "playlists" ? "all" : "playlists"))}
            >
              Playlists
            </button>
            <button
              className={libraryFilter === "albums" ? "active" : ""}
              type="button"
              onClick={() => setLibraryFilter((filter) => (filter === "albums" ? "all" : "albums"))}
            >
              Albums
            </button>
            <button
              className={libraryFilter === "artists" ? "active" : ""}
              type="button"
              onClick={() => setLibraryFilter((filter) => (filter === "artists" ? "all" : "artists"))}
            >
              Artists
            </button>
          </div>

          <div className="library-subbar">
            <label className="library-search-field">
              <Search size={18} />
              <input
                aria-label="Search library"
                onChange={(event) => setLibrarySearch(event.target.value)}
                placeholder={`Search ${libraryFilter === "all" ? "library" : libraryFilter}`}
                type="search"
                value={librarySearch}
              />
            </label>
            <ListMusic size={20} />
          </div>

          <div className="library-list">
            {(libraryFilter === "all" || libraryFilter === "playlists") && (
              <button
                className={`library-item ${view === "liked" ? "selected" : ""}`}
                onClick={() => selectView("liked")}
                type="button"
              >
                <Artwork liked size="sm" />
                <span>
                  <strong>Liked Songs</strong>
                  <small>Playlist · {likedTracks.length} songs</small>
                </span>
              </button>
            )}

            {libraryFilter === "all" &&
              followedLibraryArtists.map((artist) => (
                <button
                  className={`library-item ${selectedArtistName === artist.name ? "selected" : ""}`}
                  key={`followed-${artist.name}`}
                  onClick={() => selectView(collectionView("artist", artist.name))}
                  type="button"
                >
                  <Artwork circle track={artist.cover} size="sm" />
                  <span>
                    <strong>{artist.name}</strong>
                    <small>Following · {artist.tracks.length} songs</small>
                  </span>
                </button>
              ))}

            {libraryFilter === "all" &&
              recentLibraryPlaylists.slice(0, 5).map((playlist) => (
                <button
                  className={`library-item ${view === `playlist:${playlist.id}` ? "selected" : ""}`}
                  key={`recent-playlist-${playlist.id}`}
                  onClick={() => selectView(`playlist:${playlist.id}`)}
                  type="button"
                >
                  <PlaylistArtwork playlist={playlist} />
                  <span>
                    <strong>{playlist.name}</strong>
                    <small>
                      Recent {playlist.isPublic ? "public" : "private"} playlist · {playlist.trackIds.length} songs
                    </small>
                  </span>
                </button>
              ))}

            {libraryFilter === "playlists" &&
              visiblePlaylists.map((playlist) => (
                <button
                  className={`library-item ${view === `playlist:${playlist.id}` ? "selected" : ""}`}
                  key={playlist.id}
                  onClick={() => selectView(`playlist:${playlist.id}`)}
                  type="button"
                >
                  <PlaylistArtwork playlist={playlist} />
                  <span>
                    <strong>{playlist.name}</strong>
                    <small>
                      {playlist.isPublic ? "Public" : "Private"} playlist · {playlist.trackIds.length} songs
                    </small>
                  </span>
                </button>
              ))}

            {libraryFilter === "albums" &&
              visibleLibraryAlbums.map((album) => (
                <button
                  className={`library-item ${selectedAlbumName === album.name ? "selected" : ""}`}
                  key={album.name}
                  onClick={() => selectView(collectionView("album", album.name))}
                  type="button"
                >
                  <Artwork track={album.cover} size="sm" />
                  <span>
                    <strong>{album.name}</strong>
                    <small>Album · {album.tracks.length} songs</small>
                  </span>
                </button>
              ))}

            {libraryFilter === "artists" &&
              visibleLibraryArtists.map((artist) => (
                <button
                  className={`library-item ${selectedArtistName === artist.name ? "selected" : ""}`}
                  key={artist.name}
                  onClick={() => selectView(collectionView("artist", artist.name))}
                  type="button"
                >
                  <Artwork circle track={artist.cover} size="sm" />
                  <span>
                    <strong>{artist.name}</strong>
                    <small>{isFollowing(artist.name) ? "Following" : "Artist"} · {artist.tracks.length} songs</small>
                  </span>
                </button>
              ))}

            {libraryLoading && (
              <div className="library-empty">
                <Loader2 className="spin" size={20} />
                <span>Loading library</span>
              </div>
            )}
          </div>
        </aside>

        <div
          aria-label="Resize library"
          aria-orientation="vertical"
          className="library-resizer"
          onPointerDown={beginLibraryResize}
          role="separator"
          title="Resize library"
        />

        <section className="mobile-now-panel panel">
          {currentTrack ? (
            <>
              <div
                className="mobile-now-art-drag"
                onPointerDown={beginMobileNowDrag}
                onPointerMove={moveMobileNowDrag}
                onPointerUp={endMobileNowDrag}
                onPointerCancel={endMobileNowDrag}
              >
                <Artwork track={currentTrack} size="hero" />
              </div>
              <div className="now-title-line">
                <div>
                  <h3>{currentTrack.title}</h3>
                  <p>{currentTrack.artist}</p>
                </div>
                <IconButton active={currentTrack.liked} label="Like song" onClick={() => toggleLike(currentTrack)}>
                  <Heart fill={currentTrack.liked ? "currentColor" : "none"} size={21} />
                </IconButton>
              </div>

              <section className="credits-box">
                <div className="credits-title">
                  <h3>Credits</h3>
                  <button type="button">Show all</button>
                </div>
                <div className="credit-row">
                  <span>
                    <strong>{currentTrack.artist}</strong>
                    <small>Main Artist</small>
                  </span>
                  <button
                    className={isFollowing(currentTrack.artist) ? "active" : ""}
                    onClick={() => toggleFollow(currentTrack.artist)}
                    type="button"
                  >
                    {isFollowing(currentTrack.artist) ? "Following" : "Follow"}
                  </button>
                </div>
                <div className="credit-row">
                  <span>
                    <strong>{currentTrack.uploadedByName}</strong>
                    <small>Uploader</small>
                  </span>
                  <button
                    className={isFollowing(currentTrack.uploadedByName) ? "active" : ""}
                    onClick={() => toggleFollow(currentTrack.uploadedByName)}
                    type="button"
                  >
                    {isFollowing(currentTrack.uploadedByName) ? "Following" : "Follow"}
                  </button>
                </div>
              </section>

              <section className="queue-box">
                <div className="credits-title">
                  <h3>Next in queue</h3>
                  <button onClick={() => setManualQueue([])} type="button">Clear</button>
                </div>

                {nextQueueTracks.length ? (
                  nextQueueTracks.map((track) => (
                    <button className="queue-item" key={`${track.id}-mobile-queue`} onClick={() => playTrack(track, tracks)} type="button">
                      <Artwork track={track} size="sm" />
                      <span>
                        <strong>{track.title}</strong>
                        <small>{track.artist}</small>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="queue-empty">Queue is empty.</p>
                )}
              </section>
            </>
          ) : (
            <div className="empty-now">
              <Disc3 size={56} />
              <h3>Pick a song</h3>
              <p>Your uploads and community tracks will appear here while playing.</p>
            </div>
          )}
        </section>

        <section className="main-panel panel">
          <div className={`hero-band ${view === "home" && !search ? "home-hero" : "collection-nav"}`}>
            <div className="hero-tabs">
              {(view !== "home" || search) && (
                <IconButton label="Back" onClick={handleBackNavigation} className="back-button">
                  <ArrowLeft size={20} />
                </IconButton>
              )}
              <button
                className={view === "home" && !search ? "active" : ""}
                onClick={resetHomeView}
                type="button"
              >
                All
              </button>
              <button
                className={view === "songs" && !search ? "active" : ""}
                onClick={() => {
                  setSearch("");
                  setSearchResults(null);
                  setSearchLoading(false);
                  selectView("songs");
                }}
                type="button"
              >
                Songs
              </button>
              <button
                className={view === "podcasts" && !search ? "active" : ""}
                onClick={() => {
                  setSearch("");
                  setSearchResults(null);
                  setSearchLoading(false);
                  selectView("podcasts");
                }}
                type="button"
              >
                Podcasts
              </button>
            </div>

            {view === "home" && !search && (
              <div className="quick-grid">
                <button className="quick-tile" onClick={() => selectView("liked")} type="button">
                  <Artwork liked size="sm" />
                  <span>Liked Songs</span>
                </button>

                <button className="quick-tile upload-quick-tile" onClick={() => openUpload()} type="button">
                  <PlaylistArtwork add />
                  <span>Add songs</span>
                </button>

                {homeQuickTracks.map((track) => (
                  <button className="quick-tile" key={track.id} onClick={() => playTrack(track, recentlyPlayedTracks)} type="button">
                    <Artwork track={track} size="sm" />
                    <span>{track.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {view === "home" && !search ? (
            <>
              <Shelf
                title="Jump back in"
                tracks={homeJumpTracks}
                onPlay={playTrack}
                onQueue={addToQueue}
                onLike={toggleLike}
                onDelete={deleteTrack}
                canDeleteTrack={canDeleteTrack}
                onShowAll={() => selectView("songs")}
              />
              <Shelf
                title="Recents"
                tracks={homeRecentTracks}
                onPlay={playTrack}
                onQueue={addToQueue}
                onLike={toggleLike}
                onDelete={deleteTrack}
                canDeleteTrack={canDeleteTrack}
                onShowAll={() => selectView("recent")}
              />
              <Shelf
                title="Most played"
                tracks={homeTopTracks}
                onPlay={playTrack}
                onQueue={addToQueue}
                onLike={toggleLike}
                onDelete={deleteTrack}
                canDeleteTrack={canDeleteTrack}
                onShowAll={() => selectView("most")}
              />
            </>
          ) : (
            <section
              className={`collection-view ${compactCollectionIcon ? "compact-collection" : "cover-collection"}`}
              style={collectionStyle}
            >
              <div className={`collection-header ${compactCollectionIcon ? "compact-header" : ""}`}>
                {!compactCollectionIcon && (
                  view === "liked" ? (
                    <Artwork liked size="hero" />
                  ) : selectedPlaylist ? (
                    <PlaylistArtwork hero playlist={selectedPlaylist} />
                  ) : selectedAlbumName || selectedArtistName ? (
                    <Artwork circle={Boolean(selectedArtistName)} track={collectionCoverTrack} size="hero" />
                  ) : (
                    <div className="collection-playlist-art">
                      <Search size={42} />
                    </div>
                  )
                )}
                <div>
                  <span className="collection-kicker">
                    {activeKicker}
                  </span>
                  <div className="collection-title-row">
                    {compactCollectionIcon && (
                      <span className="collection-title-icon">
                        <Search size={24} />
                      </span>
                    )}
                    <h1>{activeTitle}</h1>
                  </div>
                  <p>{activeSubtitle}</p>
                  <div className="collection-actions">
                    <button
                      className="round-play"
                      disabled={!playableActiveTracks.length}
                      onClick={() =>
                        playableActiveTracks[0] && playTrack(playableActiveTracks[0], playableActiveTracks)
                      }
                      type="button"
                    >
                      <Play fill="currentColor" size={24} />
                    </button>
                    <IconButton
                      active={shuffleOn}
                      className="collection-shuffle"
                      disabled={!playableActiveTracks.length}
                      label="Shuffle collection"
                      onClick={() => playShuffled(playableActiveTracks)}
                    >
                      <Shuffle size={22} />
                    </IconButton>
                    {selectedPlaylist && (
                      <span className="visibility-pill">{selectedPlaylist.isPublic ? "Public" : "Private"}</span>
                    )}
                    {selectedPlaylist && selectedPlaylistOwned && (
                      <>
                        <button className="ghost-button" onClick={() => openUpload(selectedPlaylist.id)} type="button">
                          <Upload size={17} />
                          Add songs
                        </button>
                        <button
                          className="ghost-button"
                          disabled={playlistCoverSaving}
                          onClick={() => selectedPlaylistCoverFileRef.current?.click()}
                          type="button"
                        >
                          {playlistCoverSaving ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
                          Edit cover
                        </button>
                        <input
                          accept="image/*"
                          className="sr-only-file"
                          onChange={handleSelectedPlaylistCoverChange}
                          ref={selectedPlaylistCoverFileRef}
                          type="file"
                        />
                        <button
                          className={`ghost-button ${selectedPlaylist.isPublic ? "active" : ""}`}
                          onClick={() => handlePlaylistVisibility(!selectedPlaylist.isPublic)}
                          type="button"
                        >
                          <UserRound size={17} />
                          Make {selectedPlaylist.isPublic ? "private" : "public"}
                        </button>
                        <button className="ghost-button danger-button" onClick={handleDeletePlaylist} type="button">
                          <Trash2 size={17} />
                          Delete
                        </button>
                      </>
                    )}
                    {selectedAlbumName && (
                      <>
                        <button
                          className="ghost-button"
                          disabled={albumCoverSaving}
                          onClick={() => albumCoverFileRef.current?.click()}
                          type="button"
                        >
                          {albumCoverSaving ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
                          Edit cover
                        </button>
                        <input
                          accept="image/*"
                          className="sr-only-file"
                          onChange={handleAlbumCoverChange}
                          ref={albumCoverFileRef}
                          type="file"
                        />
                      </>
                    )}
                    {selectedArtistName && (
                      <>
                        <button
                          className="ghost-button"
                          disabled={artistCoverSaving}
                          onClick={() => artistCoverFileRef.current?.click()}
                          type="button"
                        >
                          {artistCoverSaving ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
                          Edit cover
                        </button>
                        <input
                          accept="image/*"
                          className="sr-only-file"
                          onChange={handleArtistCoverChange}
                          ref={artistCoverFileRef}
                          type="file"
                        />
                        <button
                          className={`ghost-button ${isFollowing(selectedArtistName) ? "active" : ""}`}
                          onClick={() => toggleFollow(selectedArtistName)}
                          type="button"
                        >
                          <UserRound size={17} />
                          {isFollowing(selectedArtistName) ? "Following" : "Follow"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <TrackTable
                addToPlaylist={addToPlaylist}
                canDeleteTrack={canDeleteTrack}
                currentTrack={currentTrack}
                emptyDescription={
                  search
                    ? "Try a different title, artist, album, or genre."
                    : view === "podcasts"
                      ? "Podcast uploads will appear here."
                      : "Uploaded music from any user will appear in the shared catalog."
                }
                emptyTitle={searchLoading ? "Searching..." : search ? "No songs found" : undefined}
                onDelete={deleteTrack}
                onLike={toggleLike}
                onPlay={playTrack}
                onQueue={addToQueue}
                onRemove={selectedPlaylist && selectedPlaylistOwned ? removeFromPlaylist : undefined}
                playlists={ownPlaylists}
                source={playableActiveTracks}
                tracks={activeTracks}
              />
            </section>
          )}
        </section>

        {detailsOpen && (
          <aside className="now-panel panel">
            <div className="now-header">
              <h2>{currentTrack?.artist || "Now playing"}</h2>
              <div className="now-menu-wrap">
                <IconButton
                  active={detailsMenuOpen}
                  label="Now playing options"
                  onClick={() => setDetailsMenuOpen((open) => !open)}
                >
                  <MoreHorizontal size={20} />
                </IconButton>
                {detailsMenuOpen && (
                  <div className="now-menu" role="menu">
                    <button
                      onClick={() => {
                        setDetailsOpen(false);
                        setDetailsMenuOpen(false);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <X size={16} />
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>

            {currentTrack ? (
              <>
                <Artwork track={currentTrack} size="hero" />
                <div className="now-title-line">
                  <div>
                    <h3>{currentTrack.title}</h3>
                    <p>{currentTrack.artist}</p>
                  </div>
                  <IconButton active={currentTrack.liked} label="Like song" onClick={() => toggleLike(currentTrack)}>
                    <Heart fill={currentTrack.liked ? "currentColor" : "none"} size={21} />
                  </IconButton>
                </div>

                <section className="credits-box">
                  <div className="credits-title">
                    <h3>Credits</h3>
                    <button type="button">Show all</button>
                  </div>
                  <div className="credit-row">
                    <span>
                      <strong>{currentTrack.artist}</strong>
                      <small>Main Artist</small>
                    </span>
                    <button
                      className={isFollowing(currentTrack.artist) ? "active" : ""}
                      onClick={() => toggleFollow(currentTrack.artist)}
                      type="button"
                    >
                      {isFollowing(currentTrack.artist) ? "Following" : "Follow"}
                    </button>
                  </div>
                  <div className="credit-row">
                    <span>
                      <strong>{currentTrack.uploadedByName}</strong>
                      <small>Uploader</small>
                    </span>
                    <button
                      className={isFollowing(currentTrack.uploadedByName) ? "active" : ""}
                      onClick={() => toggleFollow(currentTrack.uploadedByName)}
                      type="button"
                    >
                      {isFollowing(currentTrack.uploadedByName) ? "Following" : "Follow"}
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <div className="empty-now">
                <Disc3 size={56} />
                <h3>Pick a song</h3>
                <p>Your uploads and community tracks will appear here while playing.</p>
              </div>
            )}

            <section className="queue-box">
              <div className="credits-title">
                <h3>Next in queue</h3>
                <button onClick={() => setManualQueue([])} type="button">Clear</button>
              </div>

              {nextQueueTracks.length ? (
                nextQueueTracks.map((track) => (
                  <button className="queue-item" key={`${track.id}-queue`} onClick={() => playTrack(track, tracks)} type="button">
                    <Artwork track={track} size="sm" />
                    <span>
                      <strong>{track.title}</strong>
                      <small>{track.artist}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="queue-empty">Queue is empty.</p>
              )}
            </section>
          </aside>
        )}
      </section>

      <footer className="player-bar">
        <div
          className={`player-track ${currentTrack ? "interactive" : ""}`}
          onClick={(event) => {
            if (!currentTrack || (event.target as HTMLElement).closest("button")) {
              return;
            }

            setMobileLibraryOpen(false);
            setMobileNowOpen(true);
          }}
          onKeyDown={(event) => {
            if (!currentTrack || (event.key !== "Enter" && event.key !== " ")) {
              return;
            }

            event.preventDefault();
            setMobileLibraryOpen(false);
            setMobileNowOpen(true);
          }}
          role={currentTrack ? "button" : undefined}
          tabIndex={currentTrack ? 0 : undefined}
        >
          {currentTrack ? <Artwork track={currentTrack} size="sm" /> : <div className="empty-art" />}
          <span>
            <strong>{currentTrack?.title || "No song selected"}</strong>
            <small>{currentTrack?.artist || "Upload or play a track"}</small>
          </span>
          {currentTrack && (
            <IconButton
              active={currentTrack.liked}
              label="Like song"
              onClick={(event) => {
                event.stopPropagation();
                toggleLike(currentTrack);
              }}
            >
              <Heart fill={currentTrack.liked ? "currentColor" : "none"} size={18} />
            </IconButton>
          )}
        </div>

        <div className="mobile-action-dock">
          <div className="mobile-action-icons">
            <IconButton
              label="Notifications"
              onClick={openNotifications}
            >
              <Bell size={20} />
            </IconButton>
            <IconButton
              label="Friends"
              onClick={() => {
                setFriendsOpen(true);
                setProfileOpen(false);
              }}
            >
              <UserRound size={20} />
            </IconButton>
            <div className="mobile-profile-wrap">
              <button
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                className={`avatar-button ${profileOpen ? "active" : ""}`}
                onClick={() => setProfileOpen((open) => !open)}
                title={user.email}
                type="button"
              >
                {user.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={user.picture} />
                ) : (
                  user.name.slice(0, 1).toUpperCase()
                )}
              </button>
              {profileOpen && (
                <div className="profile-popover mobile-profile-popover" role="menu">
                  <div className="profile-summary">
                    <button className="avatar-button large" title={user.email} type="button">
                      {user.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={user.picture} />
                      ) : (
                        user.name.slice(0, 1).toUpperCase()
                      )}
                    </button>
                    <span>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </span>
                  </div>
                  <button onClick={() => setPlaylistOpen(true)} role="menuitem" type="button">
                    <Plus size={18} />
                    Create playlist
                  </button>
                  <button onClick={handleInstallApp} role="menuitem" type="button">
                    <Download size={18} />
                    Install
                  </button>
                  <button onClick={handleLogout} role="menuitem" type="button">
                    <LogOut size={18} />
                    Log out
                  </button>
                </div>
              )}
            </div>
            <IconButton label="Log out" onClick={handleLogout}>
              <LogOut size={20} />
            </IconButton>
          </div>
        </div>

        <div className="player-center">
          <div className="transport">
            <IconButton active={shuffleOn} label="Shuffle" onClick={() => setShuffleOn((value) => !value)}>
              <Shuffle size={20} />
            </IconButton>
            <IconButton label="Previous" onClick={playPrevious} disabled={!currentTrack}>
              <SkipBack fill="currentColor" size={21} />
            </IconButton>
            <button
              aria-label={isPlaying ? "Pause" : "Play"}
              className="play-button"
              disabled={!currentTrack && !tracks.length}
              onClick={() => {
                if (!currentTrack && tracks[0]) {
                  playTrack(tracks[0], tracks);
                  return;
                }

                setIsPlaying((value) => !value);
              }}
              title={isPlaying ? "Pause" : "Play"}
              type="button"
            >
              {isPlaying ? <Pause fill="currentColor" size={22} /> : <Play fill="currentColor" size={22} />}
            </button>
            <IconButton label="Next" onClick={playNext} disabled={!currentTrack && !tracks.length}>
              <SkipForward fill="currentColor" size={21} />
            </IconButton>
            <IconButton active={repeatMode !== "off"} label={`Repeat ${repeatMode}`} onClick={cycleRepeat}>
              {repeatMode === "one" ? <Repeat1 size={20} /> : <Repeat size={20} />}
            </IconButton>
            <IconButton active={queueOpen || nextQueueTracks.length > 0} label="Queue" onClick={() => setQueueOpen(true)}>
              <ListMusic size={20} />
            </IconButton>
          </div>

          <div className="progress-line">
            <span>{formatTime(currentTime)}</span>
            <input
              aria-label="Seek"
              max={Math.max(1, totalDuration || 1)}
              min={0}
              onChange={(event) => {
                const nextTime = Number(event.target.value);
                setCurrentTime(nextTime);

                if (audioRef.current) {
                  audioRef.current.currentTime = nextTime;
                }
              }}
              step={1}
              type="range"
              value={Math.min(currentTime, Math.max(1, totalDuration || 1))}
            />
            <span>{formatTime(totalDuration)}</span>
          </div>
        </div>

        <div className="player-tools">
          {!detailsOpen && currentTrack && (
            <IconButton label="Show now playing" onClick={() => setDetailsOpen(true)}>
              <Disc3 size={20} />
            </IconButton>
          )}
          <IconButton active={queueOpen || nextQueueTracks.length > 0} label="Queue" onClick={() => setQueueOpen(true)}>
            <ListMusic size={20} />
          </IconButton>
          <IconButton label="Lyrics" onClick={() => showToast("Lyrics view is coming next.")}>
            <Mic2 size={19} />
          </IconButton>
          <Volume2 size={20} />
          <input
            aria-label="Volume"
            max={1}
            min={0}
            onChange={(event) => setVolume(Number(event.target.value))}
            step={0.01}
            type="range"
            value={volume}
          />
        </div>
      </footer>

      {uploadOpen && (
        <Modal title={uploadTargetPlaylistId ? "Add song to playlist" : "Upload song"} onClose={closeUpload}>
          <form className="upload-form" onSubmit={handleUpload}>
            <label className="drop-field">
              <Upload size={24} />
              <span>{uploadForm.audioName || "Choose audio file"}</span>
              <small>MP3, WAV, M4A, OGG up to 100MB</small>
              <input accept="audio/*" onChange={handleAudioFileChange} ref={uploadFileRef} required type="file" />
            </label>

            <div className="form-grid">
              <label>
                <span>Title</span>
                <input
                  onChange={(event) => setUploadForm((existing) => ({ ...existing, title: event.target.value }))}
                  required
                  value={uploadForm.title}
                />
              </label>
              <label>
                <span>Artist</span>
                <input
                  onChange={(event) => setUploadForm((existing) => ({ ...existing, artist: event.target.value }))}
                  placeholder={user.name}
                  value={uploadForm.artist}
                />
              </label>
              <label>
                <span>Album</span>
                <input
                  onChange={(event) => setUploadForm((existing) => ({ ...existing, album: event.target.value }))}
                  placeholder="Single"
                  value={uploadForm.album}
                />
              </label>
              <label>
                <span>Genre</span>
                <input
                  onChange={(event) => setUploadForm((existing) => ({ ...existing, genre: event.target.value }))}
                  value={uploadForm.genre}
                />
              </label>
            </div>

            <label className="cover-field">
              <Download size={19} />
              <span>{uploadForm.coverName || "Optional cover image"}</span>
              <input accept="image/*" onChange={handleCoverFileChange} ref={coverFileRef} type="file" />
            </label>

            <button className="primary-auth-button" disabled={uploading} type="submit">
              {uploading ? <Loader2 className="spin" size={18} /> : <Upload size={18} />}
              {uploadTargetPlaylistId ? "Save to playlist" : "Save to MongoDB"}
            </button>
          </form>
        </Modal>
      )}

      {playlistOpen && (
        <Modal title="Create playlist" onClose={() => setPlaylistOpen(false)}>
          <form className="playlist-form" onSubmit={handleCreatePlaylist}>
            <label>
              <span>Name</span>
              <input
                autoFocus
                onChange={(event) => setPlaylistForm((existing) => ({ ...existing, name: event.target.value }))}
                placeholder="My playlist"
                required
                value={playlistForm.name}
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                onChange={(event) =>
                  setPlaylistForm((existing) => ({ ...existing, description: event.target.value }))
                }
                placeholder="A few words about the vibe"
                rows={3}
                value={playlistForm.description}
              />
            </label>
            <label className="cover-field">
              <Download size={19} />
              <span>{playlistForm.coverName || "Optional playlist cover"}</span>
              <input accept="image/*" onChange={handlePlaylistCoverFileChange} ref={playlistCoverFileRef} type="file" />
            </label>
            <div className="visibility-options" role="group" aria-label="Playlist visibility">
              <button
                className={!playlistForm.isPublic ? "active" : ""}
                onClick={() => setPlaylistForm((existing) => ({ ...existing, isPublic: false }))}
                type="button"
              >
                Private
              </button>
              <button
                className={playlistForm.isPublic ? "active" : ""}
                onClick={() => setPlaylistForm((existing) => ({ ...existing, isPublic: true }))}
                type="button"
              >
                Public
              </button>
            </div>
            <button className="primary-auth-button" disabled={playlistSaving} type="submit">
              {playlistSaving ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
              Create playlist
            </button>
          </form>
        </Modal>
      )}

      {queueOpen && (
        <Modal title="Queue" onClose={() => setQueueOpen(false)}>
          <QueueList
            currentTrack={currentTrack}
            onClear={() => setManualQueue([])}
            onPlay={(track) => {
              playTrack(track, tracks);
              setQueueOpen(false);
            }}
            tracks={nextQueueTracks}
          />
        </Modal>
      )}

      {activityOpen && (
        <Modal title="Notifications" onClose={() => setActivityOpen(false)}>
          {notificationsLoading ? (
            <div className="utility-panel">
              <Loader2 className="spin" size={32} />
              <h3>Loading notifications</h3>
              <p>Checking account updates and shared announcements.</p>
            </div>
          ) : notifications.length ? (
            <div className="notification-list">
              {notifications.map((notification) => (
                <article className="notification-item" key={notification.id}>
                  <Bell size={18} />
                  <span>
                    <strong>{notification.title}</strong>
                    <small>{notification.message}</small>
                    <em>{new Date(notification.createdAt).toLocaleString()}</em>
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="utility-panel">
              <Bell size={32} />
              <h3>No new notifications</h3>
              <p>Uploads, playlist changes, and account activity will appear here.</p>
            </div>
          )}
        </Modal>
      )}

      {friendsOpen && (
        <Modal title="Friends" onClose={() => setFriendsOpen(false)}>
          <div className="utility-panel">
            <UserRound size={32} />
            <h3>Friend activity is ready for accounts</h3>
            <p>Connect a social backend later to show what friends are playing.</p>
          </div>
        </Modal>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

type ShelfProps = {
  canDeleteTrack: (track: Track) => boolean;
  onDelete: (track: Track) => void;
  onLike: (track: Track) => void;
  onPlay: (track: Track, source: Track[]) => void;
  onQueue: (track: Track) => void;
  onShowAll: () => void;
  title: string;
  tracks: Track[];
};

function Shelf({ canDeleteTrack, onDelete, onLike, onPlay, onQueue, onShowAll, title, tracks }: ShelfProps) {
  if (!tracks.length) {
    return (
      <section className="shelf">
        <div className="shelf-header">
          <h2>{title}</h2>
        </div>
        <div className="empty-shelf">
          <Music size={34} />
          <span>Upload songs to fill this shelf.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="shelf">
      <div className="shelf-header">
        <h2>{title}</h2>
        <button onClick={onShowAll} type="button">Show all</button>
      </div>
      <div className="card-row">
        {tracks.map((track) => (
          <article className="track-card" key={`${title}-${track.id}`}>
            <button className="card-art-button" onClick={() => onPlay(track, tracks)} type="button">
              <Artwork track={track} size="lg" />
              <span className="card-play">
                <Play fill="currentColor" size={22} />
              </span>
            </button>
            <h3>{track.title}</h3>
            <p>{track.artist}</p>
            <div className="card-actions">
              <IconButton active={track.liked} label="Like" onClick={() => onLike(track)}>
                <Heart fill={track.liked ? "currentColor" : "none"} size={18} />
              </IconButton>
              <IconButton label="Add to queue" onClick={() => onQueue(track)}>
                <ListMusic size={18} />
              </IconButton>
              {canDeleteTrack(track) && (
                <IconButton label="Delete song" onClick={() => onDelete(track)}>
                  <Trash2 size={18} />
                </IconButton>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type TrackTableProps = {
  addToPlaylist: (playlistId: string, track: Track) => void;
  canDeleteTrack: (track: Track) => boolean;
  currentTrack: Track | null;
  emptyDescription?: string;
  emptyTitle?: string;
  onDelete: (track: Track) => void;
  onLike: (track: Track) => void;
  onPlay: (track: Track, source: Track[]) => void;
  onQueue: (track: Track) => void;
  onRemove?: (track: Track) => void;
  playlists: Playlist[];
  source: Track[];
  tracks: Track[];
};

function TrackTable({
  addToPlaylist,
  canDeleteTrack,
  currentTrack,
  emptyDescription = "Uploaded music from any user will appear in the shared catalog.",
  emptyTitle = "No songs here yet",
  onDelete,
  onLike,
  onPlay,
  onQueue,
  onRemove,
  playlists,
  source,
  tracks
}: TrackTableProps) {
  if (!tracks.length) {
    return (
      <div className="empty-table">
        <Music2 size={44} />
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="track-table">
      <div className="track-table-head">
        <span>#</span>
        <span>Title</span>
        <span>Album</span>
        <span>Added</span>
        <span>
          <Clock3 size={17} />
        </span>
      </div>

      {tracks.map((track, index) => {
        const missing = isMissingTrack(track);

        return (
          <div
            className={`track-row ${currentTrack?.id === track.id ? "playing" : ""} ${missing ? "missing" : ""}`}
            key={track.id}
          >
            <button className="track-index" disabled={missing} onClick={() => onPlay(track, source)} type="button">
              <span>{index + 1}</span>
              <Play fill="currentColor" size={16} />
            </button>
            <button className="track-title-cell" disabled={missing} onClick={() => onPlay(track, source)} type="button">
              <Artwork track={track} size="sm" />
              <span>
                <strong>{track.title}</strong>
                <small>{missing ? "Deleted from database" : track.artist}</small>
              </span>
            </button>
            <span className="table-muted">{track.album}</span>
            <span className="table-muted">{missing ? "Missing" : new Date(track.createdAt).toLocaleDateString()}</span>
            <span className="track-row-actions">
              {!missing && (
                <>
                  <IconButton active={track.liked} label="Like" onClick={() => onLike(track)}>
                    <Heart fill={track.liked ? "currentColor" : "none"} size={17} />
                  </IconButton>
                  <IconButton label="Queue" onClick={() => onQueue(track)}>
                    <ListMusic size={17} />
                  </IconButton>
                  {playlists.length ? (
                    <select
                      aria-label="Add to playlist"
                      className="playlist-select"
                      onChange={(event) => {
                        addToPlaylist(event.target.value, track);
                        event.currentTarget.value = "";
                      }}
                      value=""
                    >
                      <option value="">Playlist</option>
                      {playlists.map((playlist) => (
                        <option key={playlist.id} value={playlist.id}>
                          {playlist.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </>
              )}
              {onRemove && (
                <IconButton label={missing ? "Clean from playlist" : "Remove from playlist"} onClick={() => onRemove(track)}>
                  <X size={17} />
                </IconButton>
              )}
              {canDeleteTrack(track) && (
                <IconButton label={missing ? "Clean deleted song" : "Delete song"} onClick={() => onDelete(track)}>
                  <Trash2 size={17} />
                </IconButton>
              )}
              <span>{missing ? "Removed" : formatTime(track.duration)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

type QueueListProps = {
  currentTrack: Track | null;
  onClear: () => void;
  onPlay: (track: Track) => void;
  tracks: Track[];
};

function QueueList({ currentTrack, onClear, onPlay, tracks }: QueueListProps) {
  return (
    <div className="queue-drawer-content">
      {currentTrack ? (
        <section className="queue-current">
          <span>Now playing</span>
          <button className="queue-item" onClick={() => onPlay(currentTrack)} type="button">
            <Artwork track={currentTrack} size="sm" />
            <span>
              <strong>{currentTrack.title}</strong>
              <small>{currentTrack.artist}</small>
            </span>
          </button>
        </section>
      ) : null}

      <section>
        <div className="credits-title">
          <h3>Next up</h3>
          <button disabled={!tracks.length} onClick={onClear} type="button">
            Clear
          </button>
        </div>

        {tracks.length ? (
          <div className="queue-drawer-list">
            {tracks.map((track) => (
              <button className="queue-item" key={`${track.id}-drawer`} onClick={() => onPlay(track)} type="button">
                <Artwork track={track} size="sm" />
                <span>
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="queue-empty">Queue is empty. Add tracks with the list button beside any song.</p>
        )}
      </section>
    </div>
  );
}

type ModalProps = {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
};

function Modal({ children, onClose, title }: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" className="modal-panel" role="dialog">
        <div className="modal-header">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </section>
    </div>
  );
}
