"use client";

import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
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
import { apiFetch, mediaUrl } from "@/lib/api";
import type { AppUser, Playlist, Track } from "@/types";

type ViewState = "home" | "liked" | "songs" | "podcasts" | "recent" | "most" | `playlist:${string}`;
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

function hashValue(value: string) {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}

function gradientFor(id: string) {
  return gradients[hashValue(id) % gradients.length];
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
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

function shuffledTracks(tracks: Track[]) {
  const shuffled = [...tracks];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
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
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<AppUser | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [view, setView] = useState<ViewState>("home");
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
  const [uploading, setUploading] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [detailsMenuOpen, setDetailsMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches
  );
  const [toast, setToast] = useState("");
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
    description: ""
  });

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadLibrary = useCallback(async () => {
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
  }, []);

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
    let active = true;

    apiFetch("/api/auth/me", { cache: "no-store" })
      .then(async (result) => {
        if (!active) {
          return;
        }

        if (result.ok) {
          const data = await result.json();
          setUser(data.user);
          await loadLibrary();
        }
      })
      .finally(() => {
        if (active) {
          setBooting(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadLibrary]);

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

    return newestFirst(
      tracks.filter((track) =>
        [track.title, track.artist, track.album, track.genre].some((value) => value.toLowerCase().includes(query))
      )
    );
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

        if (playlist.tracks?.length) {
          setTracks((existing) => uniqueTracks([...playlist.tracks!, ...existing]));
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
  const podcastTracks = useMemo(() => allTracks.filter(isPodcastTrack), [allTracks]);
  const searchTracks = search.trim() ? searchResults ?? filteredTracks : filteredTracks;
  const allTopTracks = useMemo(() => [...tracks].sort((a, b) => b.plays - a.plays), [tracks]);

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

    return filteredTracks;
  }, [
    allTopTracks,
    allTracks,
    filteredTracks,
    likedTracks,
    podcastTracks,
    search,
    searchTracks,
    selectedPlaylist,
    selectedPlaylistTracks,
    view
  ]);

  const recentTracks = useMemo(() => allTracks.slice(0, 12), [allTracks]);
  const topTracks = useMemo(() => allTopTracks.slice(0, 12), [allTopTracks]);
  const uploadedMix = useMemo(() => uniqueTracks([...likedTracks, ...topTracks, ...recentTracks]).slice(0, 12), [
    likedTracks,
    recentTracks,
    topTracks
  ]);

  const nextQueueTracks = useMemo(() => {
    const fromPlayback = playbackList.slice(playbackIndex + 1, playbackIndex + 6);
    return uniqueTracks([...manualQueue, ...fromPlayback]).slice(0, 8);
  }, [manualQueue, playbackIndex, playbackList]);

  const totalDuration = currentTrack?.duration || loadedDuration;

  const updateTrackEverywhere = useCallback((trackId: string, update: (track: Track) => Track) => {
    setTracks((existing) => existing.map((track) => (track.id === trackId ? update(track) : track)));
    setPlaybackList((existing) => existing.map((track) => (track.id === trackId ? update(track) : track)));
    setManualQueue((existing) => existing.map((track) => (track.id === trackId ? update(track) : track)));
    setCurrentTrack((track) => (track?.id === trackId ? update(track) : track));
  }, []);

  const playTrack = useCallback((track: Track, source: Track[] = activeTracks) => {
    const list = source.length ? source : [track];
    const index = Math.max(0, list.findIndex((item) => item.id === track.id));

    setPlaybackList(list);
    setPlaybackIndex(index);
    setCurrentTrack(track);
    setLoadedDuration(track.duration || 0);
    setCurrentTime(0);
    setIsPlaying(true);
  }, [activeTracks]);

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

    if (repeatMode === "all" && playbackList.length) {
      const next = playbackList[0];
      setPlaybackIndex(0);
      setCurrentTrack(next);
      setLoadedDuration(next.duration || 0);
      setCurrentTime(0);
      setIsPlaying(true);
      return;
    }

    setIsPlaying(false);
  }, [manualQueue, playFromManualQueue, playTrack, playbackIndex, playbackList, repeatMode, shuffleOn, tracks]);

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
          src: mediaUrl(currentTrack.coverUrl) || "/icon.svg",
          sizes: currentTrack.coverUrl ? "512x512" : "any",
          type: currentTrack.coverUrl ? "image/jpeg" : "image/svg+xml"
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
    [currentTrack, showToast]
  );

  const addToQueue = useCallback(
    (track: Track) => {
      setManualQueue((existing) => [...existing, track]);
      setQueueOpen(true);
      showToast(`Added "${track.title}" to queue.`);
    },
    [showToast]
  );

  const addToPlaylist = useCallback(
    async (playlistId: string, track: Track) => {
      if (!playlistId) {
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
            ? { ...playlist, trackIds: [...playlist.trackIds, track.id] }
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
            ? { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== track.id) }
            : playlist
        )
      );
    },
    [selectedPlaylist, showToast]
  );

  const canDeleteTrack = useCallback(
    (track: Track) => Boolean(user && (!track.uploadedById || track.uploadedById === user.id)),
    [user]
  );

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setCurrentTrack(null);
    setIsPlaying(false);
    setTracks([]);
    setPlaylists([]);
    setView("home");
    setSearch("");
    setSearchResults(null);
    setSearchLoading(false);
    setProfileOpen(false);
    setQueueOpen(false);
  }

  async function handleInstallApp() {
    if (isInstalled) {
      showToast("The app is already installed.");
      return;
    }

    if (!installPrompt) {
      showToast("On Android Chrome, open the browser menu and tap Add to Home screen.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      showToast("Spotify Clone installed.");
    } else {
      showToast("Install dismissed.");
    }
  }

  async function handleCreatePlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!playlistForm.name.trim()) {
      return;
    }

    const result = await apiFetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(playlistForm)
    });
    const data = await result.json();

    if (!result.ok) {
      showToast(data.error || "Could not create playlist.");
      return;
    }

    setPlaylists((existing) => [data.playlist, ...existing]);
    setPlaylistOpen(false);
    setPlaylistForm({ name: "", description: "" });
    setView(`playlist:${data.playlist.id}`);
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

      setTracks((existing) => [data.track, ...existing]);
      setUploadOpen(false);
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

      showToast("Song uploaded to MongoDB.");
    } catch (error) {
      showToast((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function cycleRepeat() {
    setRepeatMode((current) => (current === "off" ? "all" : current === "all" ? "one" : "off"));
  }

  if (booting) {
    return (
      <main className="splash-screen">
        <div className="splash-mark">
          <Music2 size={42} />
        </div>
        <Loader2 className="spin" size={28} />
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(nextUser) => {
          setUser(nextUser);
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
                : `${tracks.length} songs uploaded by the community`;
  const activeKicker = search ? "Search" : selectedPlaylist || view === "liked" ? "Playlist" : "Collection";

  return (
    <main className="spotify-shell">
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

        <IconButton label="Home" onClick={() => setView("home")} active={view === "home"} className="home-button">
          <Home size={24} fill="currentColor" />
        </IconButton>

        {!isInstalled && (
          <IconButton label="Install app" onClick={handleInstallApp} className="install-icon-button">
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

              setView("home");
            }}
            placeholder="What do you want to play?"
            type="search"
            value={search}
          />
        </label>

        <button className="upload-top-button" onClick={() => setUploadOpen(true)} type="button">
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
            onClick={() => {
              setActivityOpen(true);
              setProfileOpen(false);
            }}
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
                  <strong>{playlists.length}</strong>
                  <small>Playlists</small>
                </span>
                <span>
                  <strong>{likedTracks.length}</strong>
                  <small>Liked</small>
                </span>
              </div>
              <button onClick={handleInstallApp} role="menuitem" type="button">
                <Download size={18} />
                Install Android app
              </button>
              <button onClick={() => setUploadOpen(true)} role="menuitem" type="button">
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

      <section className={`content-grid ${detailsOpen ? "" : "details-closed"}`}>
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
              <IconButton label="Expand library">
                <Maximize2 size={17} />
              </IconButton>
            </div>
          </div>

          <div className="library-chips">
            <button type="button" onClick={() => setPlaylistOpen(true)}>Playlists</button>
            <button type="button" onClick={() => setView("home")}>Albums</button>
            <button type="button" onClick={() => setView("home")}>Artists</button>
          </div>

          <div className="library-subbar">
            <Search size={21} />
            <span>Recent</span>
            <ListMusic size={20} />
          </div>

          <div className="library-list">
            <button
              className={`library-item ${view === "liked" ? "selected" : ""}`}
              onClick={() => setView("liked")}
              type="button"
            >
              <Artwork liked size="sm" />
              <span>
                <strong>Liked Songs</strong>
                <small>Playlist · {likedTracks.length} songs</small>
              </span>
            </button>

            {playlists.map((playlist) => (
              <button
                className={`library-item ${view === `playlist:${playlist.id}` ? "selected" : ""}`}
                key={playlist.id}
                onClick={() => setView(`playlist:${playlist.id}`)}
                type="button"
              >
                <div className="playlist-cover">
                  <ListMusic size={24} />
                </div>
                <span>
                  <strong>{playlist.name}</strong>
                  <small>Playlist · {playlist.trackIds.length} songs</small>
                </span>
              </button>
            ))}

            {recentTracks.map((track) => (
              <button className="library-item" key={track.id} onClick={() => playTrack(track, recentTracks)} type="button">
                <Artwork track={track} size="sm" />
                <span>
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="main-panel panel">
          <div className="hero-band">
            <div className="hero-tabs">
              <button
                className={view === "home" && !search ? "active" : ""}
                onClick={() => {
                  setSearch("");
                  setSearchResults(null);
                  setSearchLoading(false);
                  setView("home");
                }}
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
                  setView("songs");
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
                  setView("podcasts");
                }}
                type="button"
              >
                Podcasts
              </button>
            </div>

            <div className="quick-grid">
              <button className="quick-tile" onClick={() => setView("liked")} type="button">
                <Artwork liked size="sm" />
                <span>Liked Songs</span>
              </button>

              <button className="quick-tile" onClick={() => setUploadOpen(true)} type="button">
                <div className="playlist-cover add-cover">
                  <Upload size={24} />
                </div>
                <span>Add songs</span>
              </button>

              {playlists.slice(0, 4).map((playlist) => (
                <button
                  className="quick-tile"
                  key={playlist.id}
                  onClick={() => setView(`playlist:${playlist.id}`)}
                  type="button"
                >
                  <div className="playlist-cover">
                    <ListMusic size={24} />
                  </div>
                  <span>{playlist.name}</span>
                </button>
              ))}

              {recentTracks.slice(0, Math.max(0, 6 - playlists.length)).map((track) => (
                <button className="quick-tile" key={track.id} onClick={() => playTrack(track, recentTracks)} type="button">
                  <Artwork track={track} size="sm" />
                  <span>{track.title}</span>
                </button>
              ))}
            </div>
          </div>

          {view === "home" && !search ? (
            <>
              <Shelf
                title="Jump back in"
                tracks={uploadedMix}
                onPlay={playTrack}
                onQueue={addToQueue}
                onLike={toggleLike}
                onShowAll={() => setView("songs")}
              />
              <Shelf
                title="Recents"
                tracks={recentTracks}
                onPlay={playTrack}
                onQueue={addToQueue}
                onLike={toggleLike}
                onShowAll={() => setView("recent")}
              />
              <Shelf
                title="Most played"
                tracks={topTracks}
                onPlay={playTrack}
                onQueue={addToQueue}
                onLike={toggleLike}
                onShowAll={() => setView("most")}
              />
            </>
          ) : (
            <section className="collection-view">
              <div className="collection-header">
                {view === "liked" ? (
                  <Artwork liked size="hero" />
                ) : selectedPlaylist ? (
                  <div className="collection-playlist-art">
                    <ListMusic size={72} />
                  </div>
                ) : (
                  <div className="collection-playlist-art">
                    <Search size={72} />
                  </div>
                )}
                <div>
                  <span className="collection-kicker">
                    {activeKicker}
                  </span>
                  <h1>{activeTitle}</h1>
                  <p>{activeSubtitle}</p>
                  <div className="collection-actions">
                    <button
                      className="round-play"
                      disabled={!activeTracks.length}
                      onClick={() => activeTracks[0] && playTrack(activeTracks[0], activeTracks)}
                      type="button"
                    >
                      <Play fill="currentColor" size={24} />
                    </button>
                    <IconButton
                      active={shuffleOn}
                      className="collection-shuffle"
                      disabled={!activeTracks.length}
                      label="Shuffle collection"
                      onClick={() => playShuffled(activeTracks)}
                    >
                      <Shuffle size={22} />
                    </IconButton>
                    {selectedPlaylist && (
                      <button className="ghost-button" onClick={() => setUploadOpen(true)} type="button">
                        <Upload size={17} />
                        Add songs
                      </button>
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
                onRemove={selectedPlaylist ? removeFromPlaylist : undefined}
                playlists={playlists}
                source={activeTracks}
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
                    <button type="button">Follow</button>
                  </div>
                  <div className="credit-row">
                    <span>
                      <strong>{currentTrack.uploadedByName}</strong>
                      <small>Uploader</small>
                    </span>
                    <button type="button">Follow</button>
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
        <div className="player-track">
          {currentTrack ? <Artwork track={currentTrack} size="sm" /> : <div className="empty-art" />}
          <span>
            <strong>{currentTrack?.title || "No song selected"}</strong>
            <small>{currentTrack?.artist || "Upload or play a track"}</small>
          </span>
          {currentTrack && (
            <IconButton active={currentTrack.liked} label="Like song" onClick={() => toggleLike(currentTrack)}>
              <Heart fill={currentTrack.liked ? "currentColor" : "none"} size={18} />
            </IconButton>
          )}
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
        <Modal title="Upload song" onClose={() => setUploadOpen(false)}>
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
              Save to MongoDB
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
            <button className="primary-auth-button" type="submit">
              <Plus size={18} />
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
          <div className="utility-panel">
            <Bell size={32} />
            <h3>No new notifications</h3>
            <p>Uploads, playlist changes, and account activity will appear here.</p>
          </div>
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
  onLike: (track: Track) => void;
  onPlay: (track: Track, source: Track[]) => void;
  onQueue: (track: Track) => void;
  onShowAll: () => void;
  title: string;
  tracks: Track[];
};

function Shelf({ onLike, onPlay, onQueue, onShowAll, title, tracks }: ShelfProps) {
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

      {tracks.map((track, index) => (
        <div className={`track-row ${currentTrack?.id === track.id ? "playing" : ""}`} key={track.id}>
          <button className="track-index" onClick={() => onPlay(track, source)} type="button">
            <span>{index + 1}</span>
            <Play fill="currentColor" size={16} />
          </button>
          <button className="track-title-cell" onClick={() => onPlay(track, source)} type="button">
            <Artwork track={track} size="sm" />
            <span>
              <strong>{track.title}</strong>
              <small>{track.artist}</small>
            </span>
          </button>
          <span className="table-muted">{track.album}</span>
          <span className="table-muted">{new Date(track.createdAt).toLocaleDateString()}</span>
          <span className="track-row-actions">
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
            {onRemove && (
              <IconButton label="Remove from playlist" onClick={() => onRemove(track)}>
                <X size={17} />
              </IconButton>
            )}
            {canDeleteTrack(track) && (
              <IconButton label="Delete song" onClick={() => onDelete(track)}>
                <Trash2 size={17} />
              </IconButton>
            )}
            <span>{formatTime(track.duration)}</span>
          </span>
        </div>
      ))}
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
