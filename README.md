[The website is live here:](https://spotify-ggx2.onrender.com/)

# spotify

A Spotify-style music app split into separate deployable frontend and backend Next.js services, backed by MongoDB and GridFS.

## Features

- Email/password authentication with secure password hashing
- Continue with Google sign-in
- MongoDB-backed users, likes, playlists, and track metadata
- GridFS-backed audio and cover image uploads
- Shared catalog: uploaded songs are available to every logged-in user
- Search, liked songs, playlists, queue, shuffle, repeat, volume, and seek controls
- Spotify-inspired desktop UI with library, home feed, now-playing panel, and bottom player

## Setup

Create a root `.env.local` from `.env.example` and fill in the values each side needs. Both workspace apps load the root env file.

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

Open the frontend dev URL printed by Next.js. The deployed frontend uses the Render backend by default.

For a Render frontend service with root directory set to `frontend`, use build command `npm install && npm run build` and publish directory `out`.

Frontend variables:

```bash
NEXT_PUBLIC_API_URL="https://spotify-clone-rt8l.onrender.com"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-oauth-client-id"
```

Backend variables:

```bash
MONGODB_URI="mongodb+srv://..."
MONGODB_DB="spotify_clone"
JWT_SECRET="generate-a-long-random-secret"
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
FRONTEND_URL="https://spotify-ggx2.onrender.com"
```

For Google sign-in, create an OAuth web client in Google Cloud and set both `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
