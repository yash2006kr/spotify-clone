# Deployment

This app cannot be hosted as a plain GitHub Pages site because it uses Next.js API routes for auth, MongoDB, GridFS uploads, and audio streaming. GitHub Pages is for static HTML/CSS/JavaScript hosting, and Next.js API routes are not available in static exports.

GitHub should be the source repo, and a Node-capable host should build and run the app from that repo.

## Recommended Hosting

Use a Node web service such as Render, Railway, Fly.io, a VPS, or another platform that supports long-running Node apps and environment variables. Vercel can run Next.js, but large music uploads are often better on a Node service because serverless request limits can be tight.

## Required Environment Variables

Set these on the host:

```bash
MONGODB_URI="mongodb+srv://..."
MONGODB_DB="spotify_clone"
JWT_SECRET="generate-a-long-random-secret"
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-oauth-client-id"
```

## Generic Node Host Settings

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm run start
```

Use Node.js 20 or newer. After the site is deployed over HTTPS, Android Chrome can show the install option and lock-screen media controls.

## Useful Docs

- GitHub Pages static hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- Next.js API routes and static export warning: https://nextjs.org/docs/messages/api-routes-static-export
- Render Next.js from GitHub: https://render.com/docs/deploy-nextjs-app
