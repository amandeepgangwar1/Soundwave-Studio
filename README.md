<p align="center">
  <img src="img/soundwave.svg" alt="Soundwave Studio" width="84">
</p>

<h1 align="center">Soundwave Studio</h1>

<p align="center">
  A full-stack music streaming web app with playlists, playback, user libraries, likes, uploads, and Netlify-ready deployment.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20JavaScript-2f80ed?style=for-the-badge" alt="Frontend">
  <img src="https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-1f9d55?style=for-the-badge" alt="Backend">
  <img src="https://img.shields.io/badge/Database-MongoDB-47a248?style=for-the-badge" alt="MongoDB">
  <img src="https://img.shields.io/badge/Deploy-Netlify-00c7b7?style=for-the-badge" alt="Netlify">
</p>

---

## Overview

Soundwave Studio lets users browse curated music playlists, play tracks, save playlists to their library, and like songs. It also includes a signed-in management console for creating playlists, uploading songs, replacing covers/audio, and maintaining the music catalog.

## Highlights

- Account signup and login with secure password hashing
- Cookie-based sessions
- Playlist browsing and song playback
- Save playlists to a personal library
- Like and manage favorite songs
- Management panel for playlist and song uploads
- MongoDB persistence through Mongoose models
- Netlify Functions wrapper for serverless deployment
- Local song folder seeding from `songs/*/info.json`

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Auth | bcryptjs, cookie-parser |
| Uploads | Multer |
| Deployment | Netlify Functions, serverless-http |

## Project Structure

```text
.
|-- Cascading Style Sheets/     # App styling
|-- JavaScript/                 # Frontend scripts
|-- img/                        # Icons and brand assets
|-- sections/                   # Extra app pages
|-- songs/                      # Playlist folders and audio assets
|-- server/
|   |-- db.js                   # MongoDB models and seed helpers
|   |-- index.js                # Express API and static server
|   `-- netlify/functions/api.js # Netlify serverless entry
|-- netlify.toml                # Netlify build and API redirects
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

3. Start the app:

```bash
npm run dev
```

4. Open:

```text
http://localhost:3000
```

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `MONGO_URI` | Recommended | MongoDB connection string. Defaults to local `soundwave` database. |

## Deployment

This project is configured for Netlify:

- Build command: `npm --prefix server install`
- Publish directory: `.`
- Functions directory: `server/netlify/functions`
- API redirect: `/api/*` to the Express serverless function

Set `MONGO_URI` in Netlify environment variables before deploying.

## Author

Built by Amandeep Gangwar.
