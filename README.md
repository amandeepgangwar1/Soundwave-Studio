<p align="center">
  <img src="img/soundwave.svg" alt="Soundwave Studio" width="84">
</p>

<h1 align="center">Soundwave Studio</h1>

<p align="center">
  A full-stack music streaming web app with playlists, playback, user libraries, likes, uploads, and Render/Vercel deployment.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20JavaScript-2f80ed?style=for-the-badge" alt="Frontend">
  <img src="https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-1f9d55?style=for-the-badge" alt="Backend">
  <img src="https://img.shields.io/badge/Database-MongoDB-47a248?style=for-the-badge" alt="MongoDB">
  <img src="https://img.shields.io/badge/Deploy-Render%20%7C%20Vercel-000000?style=for-the-badge" alt="Render and Vercel">
</p>

---

## Overview

Soundwave Studio lets users browse curated music playlists, play tracks, save playlists to their library, and like songs. It also includes a signed-in management console for creating playlists, uploading songs, replacing covers/audio, and maintaining the music catalog.

## Highlights

- Account signup and login with secure password hashing
- Email, phone, Google-labelled, and Facebook-labelled account creation paths
- Cookie-based sessions
- Guest playlist browsing
- Global search across songs, artists, albums, playlists, and podcast placeholders
- Playlist browsing and song playback
- Save playlists to a personal library
- Like and manage favorite songs
- Follow artists and use follows for recommendations
- AI-assisted song recommendations with cached OpenAI embeddings
- User playlist create, rename, delete, add-song, remove-song, and share-link workflows
- Premium subscription purchase flow with UPI, card, net banking, and wallet options through the built-in Soundwave Test Gateway
- Premium-only offline/download controls
- Management panel for playlist and song uploads
- Admin user, artist, song metadata, album, and reporting views
- MongoDB persistence through Mongoose models
- Render web service deployment and Vercel serverless API deployment
- Local song folder seeding from `songs/*/info.json`

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| AI recommendations | OpenAI `text-embedding-3-small` embeddings |
| Auth | bcryptjs, cookie-parser |
| Uploads | Multer |
| Deployment | Render, Vercel Functions |

## Implemented SRS Coverage

- Users: guest preview, registered listeners, premium listeners, artists/follows, and admin roles.
- Core music: search, play, pause, resume, skip, repeat, shuffle, volume, progress, likes, playlists, sharing, library, recommendations, recent history, and downloads.
- Catalog: songs, artists, albums, playlists, followed artists, liked songs, payments, and user playlists.
- Admin: create/update/delete playlists and songs, replace covers/audio, edit song metadata, manage users, manage artists, view reports.
- Premium: simulated payment records and subscription upgrades for no ads, offline listening, high-quality audio, and unlimited skips.

## Project Structure

```text
.
|-- Cascading Style Sheets/     # App styling
|-- JavaScript/                 # Frontend scripts
|-- img/                        # Icons and brand assets
|-- sections/                   # Extra app pages
|-- songs/                      # Playlist folders and audio assets
|-- api/[...path].js            # Vercel API function entry
|-- server/
|   |-- db.js                   # MongoDB models and seed helpers
|   `-- index.js                # Express API and static server
|-- render.yaml                 # Render web service blueprint
|-- vercel.json                 # Vercel install/function config
`-- package.json                # Root dev script
```

## Run Locally

1. Install backend dependencies:

```bash
npm --prefix server install
```

2. Set MongoDB connection string:

```bash
# PowerShell
$env:MONGO_URI="mongodb://127.0.0.1:27017/soundwave"
```

3. Optional: enable AI recommendations:

```bash
# PowerShell
$env:OPENAI_API_KEY="your_openai_api_key"
```

4. Start the app:

```bash
npm run dev
```

5. Open:

```text
http://localhost:3000
```

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `MONGO_URI` | Recommended | MongoDB connection string. Defaults to local `soundwave` database. |
| `OPENAI_API_KEY` | Optional | Enables AI-assisted recommendations with `text-embedding-3-small`. Without it, the app uses the built-in rule-based recommendations. |
| `OPENAI_EMBEDDING_MODEL` | Optional | Embedding model for recommendation similarity. Defaults to `text-embedding-3-small`. |
| `OPENAI_EMBEDDING_DIMENSIONS` | Optional | Embedding vector size stored in MongoDB. Defaults to `512`. |
| `RAZORPAY_KEY_ID` | Optional | Only needed if you later switch from the built-in test gateway to real Razorpay Checkout. |
| `RAZORPAY_KEY_SECRET` | Optional | Only needed for real Razorpay order creation and signature verification. |

## Payment Gateway

The app uses a local Soundwave Test Gateway by default, so Premium activation works without a Razorpay or Stripe account. It records payment orders in MongoDB, marks the selected plan as paid, and upgrades the user account.

For real money collection, connect a payment provider account and use the optional Razorpay order and verification endpoints already present in the backend.

## Deployment

This project is configured for Render and Vercel.

### Render

Use Render when you want the full Express app running as one web service.

- Blueprint file: `render.yaml`
- Build command: `npm --prefix server install`
- Start command: `npm --prefix server start`
- Required environment variable: `MONGO_URI`
- Optional environment variables: `OPENAI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`

Steps:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Set `MONGO_URI` in Render environment variables.
4. Deploy.

### Vercel

Use Vercel when you want static frontend hosting with the Express API running through Vercel Functions.

- Vercel API entry: `api/[...path].js`
- Install command: `npm --prefix server install`
- Required environment variable: `MONGO_URI`
- Optional environment variables: `OPENAI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`

Steps:

1. Push this repository to GitHub.
2. Import the repo in Vercel.
3. Keep the project root as `.`.
4. Set the environment variables.
5. Deploy.

For production uploads, use durable object storage such as S3, Cloudinary, or another file store. Vercel Functions have a read-only project filesystem and request payload limits, so large admin audio uploads are better handled on Render with a persistent disk or through external storage. Render deployments also need a persistent disk or external storage if uploaded songs must survive redeploys.

## Author

Built by Amandeep Gangwar.
