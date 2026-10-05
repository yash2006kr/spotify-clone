<div align="center">
  <h1>🎵 Spotify Clone</h1>
  <p>A full-stack Spotify-style music application built with Next.js, MongoDB, and GridFS.</p>
  
  [![Live Demo](https://img.shields.io/badge/Live_Website-1DB954?style=for-the-badge&logo=spotify&logoColor=white)](https://spotify-ggx2.onrender.com/)
</div>

<br />

## ✨ Features

- 🔐 **Authentication:** Secure email/password hashing and "Continue with Google" OAuth sign-in.
- 🗄️ **Database:** MongoDB-backed users, likes, playlists, and track metadata.
- 🎵 **File Storage:** GridFS-backed audio and cover image uploads.
- 🌍 **Shared Catalog:** Uploaded songs are universally available to every logged-in user.
- 🎛️ **Advanced Player:** Search, liked songs, playlists, queue, shuffle, repeat, volume, and seek controls.
- 💻 **Desktop UI:** Authentic Spotify-inspired interface featuring a library, home feed, now-playing panel, and bottom player.

## 🚀 Tech Stack

- **Frontend:** Next.js
- **Backend:** Next.js (Separate deployable service)
- **Database & Storage:** MongoDB, GridFS
- **Deployment:** Render

## 🛠️ Getting Started

### 1. Installation
```bash
npm install
```

### 2. Environment Variables
Create a root `.env.local` from `.env.example` and populate the required values. Both workspace apps load the root env file.

**Frontend Variables:**
```env
NEXT_PUBLIC_API_URL="[https://spotify-clone-rt8l.onrender.com](https://spotify-clone-rt8l.onrender.com)"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-oauth-client-id"
```

**Backend Variables:**
```env
MONGODB_URI="mongodb+srv://..."
MONGODB_DB="spotify_clone"
JWT_SECRET="generate-a-long-random-secret"
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
FRONTEND_URL="[https://spotify-ggx2.onrender.com](https://spotify-ggx2.onrender.com)"
```
> **Note:** For Google sign-in, create an OAuth web client in Google Cloud and set both `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

### 3. Run Development Servers
Start both services concurrently or in separate terminal tabs:
```bash
npm run dev:backend
npm run dev:frontend
```
Open the frontend dev URL printed by Next.js. *(The deployed frontend uses the Render backend by default).*

## ☁️ Deployment (Render)

To deploy the frontend as a Render static site or web service, use the following configuration:

- **Root Directory:** `frontend`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `out`
