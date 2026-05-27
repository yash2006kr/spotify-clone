# Deployment

This app is now split into `frontend/` and `backend/` so each side can be hosted separately.

The frontend is a Next.js UI. The backend is a separate Next.js API service for auth, MongoDB, GridFS uploads, and audio streaming.

## Recommended Hosting

Use Node-capable services such as Render, Railway, Fly.io, a VPS, or Vercel. Large music uploads are often better on a long-running Node service because serverless request limits can be tight.

The frontend can be deployed as a Render Static Site because it is only the UI and calls the deployed backend API from the browser.

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
NEXT_PUBLIC_API_URL="https://spotify-clone-rt8l.onrender.com"
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

## Frontend Render Static Site Settings

Use these settings if configuring the existing Render Static Site manually:

```bash
Root directory: frontend
Build command: npm install && npm run build
Publish directory: out
```

Do not run `npm start` for the frontend Static Site. Static site builds must finish and publish the generated files in `out` inside the `frontend` root directory.

The repository also includes `render.yaml` with the same frontend settings for Render Blueprints.

In the backend Render service, set `FRONTEND_URL` to the final frontend URL, for example:

```bash
FRONTEND_URL="https://spotify-ggx2.onrender.com"
```

Use Node.js 20 or newer. Add both deployed origins to your Google OAuth web client: the frontend origin for the button and the backend origin if your Google console requires it.

## Useful Docs

- GitHub Pages static hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- Next.js static exports: https://nextjs.org/docs/app/guides/static-exports
- Render Next.js from GitHub: https://render.com/docs/deploy-nextjs-app
