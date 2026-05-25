# Spotify Clone

A full-stack Spotify-style music app built with Next.js, MongoDB, and GridFS.

## Features

- Email/password authentication with secure password hashing
- Google sign-in endpoint and UI hook
- MongoDB-backed users, likes, playlists, and track metadata
- GridFS-backed audio and cover image uploads
- Shared catalog: uploaded songs are available to every logged-in user
- Search, liked songs, playlists, queue, shuffle, repeat, volume, and seek controls
- Spotify-inspired desktop UI with library, home feed, now-playing panel, and bottom player

## Setup

Create `.env.local` from `.env.example` and fill in your values.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For Google sign-in, create an OAuth web client in Google Cloud and set both `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
