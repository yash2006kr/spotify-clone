import { Db, GridFSBucket, MongoClient } from "mongodb";

import "@/lib/env";

declare global {
  var __spotifyMongoClientPromise: Promise<MongoClient> | undefined;
}

let indexPromise: Promise<void> | null = null;

function getMongoUri() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing. Add it to the root .env.local or hosting env.");
  }

  return uri;
}

export function getMongoClient() {
  if (!globalThis.__spotifyMongoClientPromise) {
    const client = new MongoClient(getMongoUri(), {
      appName: "spotify-clone"
    });

    globalThis.__spotifyMongoClientPromise = client.connect();
  }

  return globalThis.__spotifyMongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB || "spotify_clone");
}

export async function getBucket(bucketName: "audio" | "covers") {
  return new GridFSBucket(await getDb(), { bucketName });
}

export async function ensureIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const db = await getDb();

      await Promise.all([
        db.collection("users").createIndex({ email: 1 }, { unique: true }),
        db.collection("users").createIndex({ name: 1 }),
        db.collection("tracks").createIndex({ title: "text", artist: "text", album: "text", genre: "text" }),
        db.collection("tracks").createIndex({ createdAt: -1 }),
        db.collection("tracks").createIndex({ plays: -1 }),
        db.collection("likes").createIndex({ userId: 1, trackId: 1 }, { unique: true }),
        db.collection("playlists").createIndex({ ownerId: 1, updatedAt: -1 }),
        db.collection("playlists").createIndex({ isPublic: 1, updatedAt: -1 }),
        db.collection("artistCovers").createIndex({ artistKey: 1 }, { unique: true }),
        db.collection("notifications").createIndex({ targetEmail: 1, createdAt: -1 }),
        db.collection("notifications").createIndex({ key: 1 }, { unique: true, sparse: true })
      ]);
    })();
  }

  return indexPromise;
}
