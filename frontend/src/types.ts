export type AppUser = {
  id: string;
  name: string;
  email: string;
  picture?: string;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  plays: number;
  liked: boolean;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
  audioUrl: string;
  coverUrl: string | null;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  coverColor: string;
  isPublic: boolean;
  ownerId: string;
  trackIds: string[];
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  tracks?: Track[];
};

export type AuthMode = "login" | "register" | "forgot";
