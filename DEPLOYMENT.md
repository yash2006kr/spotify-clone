# Deployment

This app is now split into `frontend/` and `backend/` so each side can be hosted separately.

The frontend is a Next.js UI. The backend is a separate Next.js API service for auth, MongoDB, GridFS uploads, and audio streaming.

## Recommended Hosting

Use Node-capable services such as Render, Railway, Fly.io, a VPS, or Vercel. Large music uploads are often better on a long-running Node service because serverless request limits can be tight.

## Required Environment Variables

Backend variables:

```bash
MONGODB_URI="mongodb+srv://..."
MONGODB_DB="spotify_clone"
JWT_SECRET="generate-a-long-random-secret"
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
FRONTEND_URL="https://your-frontend.example"
```

Frontend variables:

```bash
NEXT_PUBLIC_API_URL="https://your-backend.example"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-oauth-client-id"
```

## Backend Host Settings

Root directory: `backend`

```bash
npm install
npm run build
```

Start command:

```bash
npm start
```

## Frontend Host Settings

Root directory: `frontend`

```bash
npm install
npm run build
npm start
```

Use Node.js 20 or newer. Add both deployed origins to your Google OAuth web client: the frontend origin for the button and the backend origin if your Google console requires it.

## Useful Docs

- GitHub Pages static hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- Next.js API routes and static export warning: https://nextjs.org/docs/messages/api-routes-static-export
- Render Next.js from GitHub: https://render.com/docs/deploy-nextjs-app
