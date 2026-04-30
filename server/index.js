const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { connectDb, seedIfEmpty, getNextId, models } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 7;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});
const songsRoot = path.join(__dirname, "..", "songs");

app.use(express.json());
app.use(cookieParser());

app.use(async (req, res, next) => {
  const adminAssets =
    req.path === "/admin.html" || req.path === "/JavaScript/admin.js";
  if (!adminAssets) return next();

  const user = await getUserFromRequest(req);
  if (!user) {
    res.redirect("/admin-login.html");
    return;
  }
  next();
});

app.use(express.static(path.join(__dirname, "..")));

const {
  User,
  Session,
  Playlist,
  Song,
  LibraryPlaylist,
  LikedSong,
  AdminUser
} = models;

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function sanitizeFolder(value) {
  if (!value) return null;
  const cleaned = value.trim();
  if (!/^[a-zA-Z0-9_\-()]+$/.test(cleaned)) return null;
  return cleaned;
}

function slugifyFolder(value) {
  if (!value) return null;
  const base = value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-()]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || null;
}

function ensureInsideSongsRoot(targetPath) {
  const resolvedRoot = path.resolve(songsRoot);
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Invalid songs path");
  }
  return resolvedTarget;
}

async function resolveSongCover(folder, filename) {
  const base = path.parse(filename).name;
  const extensions = [".jpg", ".jpeg", ".png", ".webp"];
  for (const ext of extensions) {
    const filePath = path.join(__dirname, "..", "songs", folder, `${base}${ext}`);
    try {
      await fs.access(filePath);
      return `/songs/${folder}/${base}${ext}`;
    } catch (err) {
      // Keep checking other extensions.
    }
  }
  return null;
}

async function loadSongCoverMap(folder) {
  const infoPath = path.join(songsRoot, folder, "info.json");
  try {
    const raw = await fs.readFile(infoPath, "utf8");
    const info = JSON.parse(raw);
    if (!info || typeof info !== "object" || !info.songCovers) return new Map();

    const map = new Map();
    for (const [songFile, coverFile] of Object.entries(info.songCovers)) {
      if (typeof songFile !== "string" || typeof coverFile !== "string") continue;
      const safeCover = path.basename(coverFile);
      if (!safeCover) continue;
      map.set(songFile, `/songs/${folder}/${safeCover}`);
    }
    return map;
  } catch (err) {
    return new Map();
  }
}

async function updateInfoJsonWithSong(folder, filename) {
  const infoPath = path.join(songsRoot, folder, "info.json");
  try {
    const raw = await fs.readFile(infoPath, "utf8");
    const info = JSON.parse(raw);
    if (!info || typeof info !== "object") return;
    if (!Array.isArray(info.songs)) info.songs = [];
    if (!info.songs.includes(filename)) {
      info.songs.push(filename);
      await fs.writeFile(infoPath, JSON.stringify(info, null, 4));
    }
  } catch (err) {
    // Ignore missing or invalid info.json.
  }
}

async function removeSongFromInfo(folder, filename) {
  const infoPath = path.join(songsRoot, folder, "info.json");
  try {
    const raw = await fs.readFile(infoPath, "utf8");
    const info = JSON.parse(raw);
    if (!info || typeof info !== "object") return;
    if (Array.isArray(info.songs)) {
      info.songs = info.songs.filter((song) => song !== filename);
    }
    if (info.songCovers && typeof info.songCovers === "object") {
      delete info.songCovers[filename];
    }
    await fs.writeFile(infoPath, JSON.stringify(info, null, 4));
  } catch (err) {
    // Ignore missing or invalid info.json.
  }
}

async function buildFolderIndex() {
  const folders = new Map();
  try {
    const entries = await fs.readdir(songsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = entry.name;
      const infoPath = path.join(songsRoot, folder, "info.json");
      try {
        const raw = await fs.readFile(infoPath, "utf8");
        const info = JSON.parse(raw);
        if (info && typeof info.title === "string") {
          folders.set(info.title, { folder, cover: info.cover });
        }
      } catch (err) {
        // Ignore missing info.json.
      }
    }
  } catch (err) {
    return folders;
  }
  return folders;
}

async function syncPlaylistsWithFolders() {
  const titleIndex = await buildFolderIndex();
  const playlists = await Playlist.find().select("playlistId title folder cover").lean();

  for (const playlist of playlists) {
    const existingFolder = path.join(songsRoot, playlist.folder);
    let folderExists = false;
    try {
      const stats = await fs.stat(existingFolder);
      folderExists = stats.isDirectory();
    } catch (err) {
      folderExists = false;
    }

    if (folderExists) continue;

    const match = titleIndex.get(playlist.title);
    if (!match) continue;

    const newFolder = match.folder;
    const newCover = match.cover || playlist.cover;
    await Playlist.updateOne(
      { playlistId: playlist.playlistId },
      { folder: newFolder, cover: newCover }
    );
  }
}

async function getUserFromRequest(req) {
  const token = req.cookies.auth_token;
  if (!token) return null;

  const session = await Session.findOne({ token }).lean();
  if (!session) return null;

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await Session.deleteOne({ token });
    return null;
  }

  const user = await User.findOne({ userId: session.userId }).lean();
  if (!user) return null;
  return { id: user.userId, name: user.name, email: user.email };
}

function requireAuth(handler) {
  return async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = user;
    handler(req, res);
  };
}

let appReadyPromise;

async function prepareApp() {
  if (appReadyPromise) return appReadyPromise;

  appReadyPromise = (async () => {
  await connectDb();
  await seedIfEmpty();
  await syncPlaylistsWithFolders();
  console.log("Database connected.");

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, db: "connected" });
  });

  app.get("/api/me", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({ id: user.id, name: user.name, email: user.email });
  });

  app.post("/api/auth/signup", async (req, res) => {
    const { name, email, password } = req.body || {};
    const cleanName = String(name || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!cleanName || !normalizedEmail || !password) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }

    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const userId = await getNextId("user");
    await User.create({
      userId,
      name: cleanName,
      email: normalizedEmail,
      passwordHash: hash
    });

    const token = createToken();
    const expiresAt = addDays(SESSION_DAYS);
    await Session.create({
      token,
      userId,
      expiresAt: new Date(expiresAt)
    });

    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      expires: new Date(expiresAt)
    });
    res.json({ ok: true });
  });

  app.post("/api/admin/signup", async (req, res) => {
    const { name, email, password } = req.body || {};
    const cleanName = String(name || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!cleanName || !normalizedEmail || !password) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }

    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const userId = await getNextId("user");
    await User.create({
      userId,
      name: cleanName,
      email: normalizedEmail,
      passwordHash: hash
    });
    await AdminUser.updateOne(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true }
    );

    const token = createToken();
    const expiresAt = addDays(SESSION_DAYS);
    await Session.create({
      token,
      userId,
      expiresAt: new Date(expiresAt)
    });

    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      expires: new Date(expiresAt)
    });
    res.json({ ok: true, approved: true });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }

    const user = await User.findOne({ email: normalizedEmail }).lean();
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = createToken();
    const expiresAt = addDays(SESSION_DAYS);
    await Session.create({
      token,
      userId: user.userId,
      expiresAt: new Date(expiresAt)
    });

    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      expires: new Date(expiresAt)
    });
    res.json({ ok: true });
  });

  app.post("/api/admin/login", async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }

    const user = await User.findOne({ email: normalizedEmail }).lean();
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = createToken();
    const expiresAt = addDays(SESSION_DAYS);
    await Session.create({
      token,
      userId: user.userId,
      expiresAt: new Date(expiresAt)
    });

    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      expires: new Date(expiresAt)
    });
    res.json({ ok: true });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = req.cookies.auth_token;
    if (token) {
      await Session.deleteOne({ token });
    }
    res.clearCookie("auth_token");
    res.json({ ok: true });
  });

  app.get("/api/playlists", async (req, res) => {
    const rows = await Playlist.find()
      .sort({ playlistId: 1 })
      .select("playlistId title description folder cover")
      .lean();
    const playlists = rows.map((row) => ({
      id: row.playlistId,
      title: row.title,
      description: row.description,
      folder: row.folder,
      coverUrl: `/songs/${row.folder}/${row.cover}`
    }));
    res.json(playlists);
  });

  app.get("/api/playlists/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid playlist id" });
      return;
    }

    const playlist = await Playlist.findOne({ playlistId: id }).lean();
    if (!playlist) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    const songs = await Song.find({ playlistId: id })
      .sort({ trackNumber: 1 })
      .select("songId filename")
      .lean();

    const songCoverMap = await loadSongCoverMap(playlist.folder);
    const songsWithCovers = await Promise.all(
      songs.map(async (row) => ({
        id: row.songId,
        filename: row.filename,
        coverUrl:
          songCoverMap.get(row.filename) ||
          (await resolveSongCover(playlist.folder, row.filename))
      }))
    );

    res.json({
      id: playlist.playlistId,
      title: playlist.title,
      description: playlist.description,
      folder: playlist.folder,
      coverUrl: `/songs/${playlist.folder}/${playlist.cover}`,
      songs: songsWithCovers
    });
  });

  app.get("/api/library", requireAuth(async (req, res) => {
    const libraryPlaylists = await LibraryPlaylist.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    const playlistIds = libraryPlaylists.map((row) => row.playlistId);
    const playlistRows = playlistIds.length
      ? await Playlist.find({ playlistId: { $in: playlistIds } })
          .select("playlistId title description folder cover")
          .lean()
      : [];
    const playlistMap = new Map(
      playlistRows.map((row) => [row.playlistId, row])
    );

    const likedRows = await LikedSong.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    const songIds = likedRows.map((row) => row.songId);
    const songRows = songIds.length
      ? await Song.find({ songId: { $in: songIds } })
          .select("songId filename playlistId")
          .lean()
      : [];
    const songMap = new Map(songRows.map((row) => [row.songId, row]));

    const playlistIdsForSongs = Array.from(
      new Set(songRows.map((row) => row.playlistId))
    );
    const playlistRowsForSongs = playlistIdsForSongs.length
      ? await Playlist.find({ playlistId: { $in: playlistIdsForSongs } })
          .select("playlistId title folder")
          .lean()
      : [];
    const playlistMapForSongs = new Map(
      playlistRowsForSongs.map((row) => [row.playlistId, row])
    );

    res.json({
      playlists: playlistIds
        .map((id) => playlistMap.get(id))
        .filter(Boolean)
        .map((row) => ({
          id: row.playlistId,
          title: row.title,
          description: row.description,
          coverUrl: `/songs/${row.folder}/${row.cover}`
        })),
      songs: likedRows
        .map((row) => songMap.get(row.songId))
        .filter(Boolean)
        .map((song) => {
          const playlist = playlistMapForSongs.get(song.playlistId);
          return {
            id: song.songId,
            filename: song.filename,
            playlistId: song.playlistId,
            playlistTitle: playlist ? playlist.title : "",
            fileUrl: playlist
              ? `/songs/${playlist.folder}/${song.filename}`
              : ""
          };
        })
    });
  }));

  app.get("/api/admin/check", requireAuth(async (req, res) => {
    res.json({ ok: true });
  }));

  app.get("/api/admin/playlists", requireAuth(async (req, res) => {
    const rows = await Playlist.find()
      .sort({ title: 1 })
      .select("playlistId title folder")
      .lean();
    res.json(rows.map((row) => ({
      id: row.playlistId,
      title: row.title,
      folder: row.folder
    })));
  }));

  app.get("/api/admin/playlists/:id/songs", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid playlist id" });
      return;
    }

    const playlist = await Playlist.findOne({ playlistId: id }).lean();
    if (!playlist) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    const songs = await Song.find({ playlistId: id })
      .sort({ trackNumber: 1 })
      .select("songId filename trackNumber")
      .lean();

    const songCoverMap = await loadSongCoverMap(playlist.folder);
    const rows = await Promise.all(
      songs.map(async (row) => ({
        id: row.songId,
        filename: row.filename,
        trackNumber: row.trackNumber,
        coverUrl:
          songCoverMap.get(row.filename) ||
          (await resolveSongCover(playlist.folder, row.filename))
      }))
    );

    res.json(rows);
  }));

  app.post(
    "/api/admin/playlists",
    upload.single("cover"),
    requireAuth(async (req, res) => {
      const { title, description, folder } = req.body || {};
      if (!title || !description) {
        res.status(400).json({ error: "Missing fields" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Cover image is required" });
        return;
      }

      const safeFolder =
        sanitizeFolder(folder) ||
        slugifyFolder(folder) ||
        slugifyFolder(title);
      if (!safeFolder) {
        res.status(400).json({ error: "Invalid folder name" });
        return;
      }

      const existing = await Playlist.findOne({ folder: safeFolder }).lean();
      if (existing) {
        res.status(409).json({ error: "Folder already exists" });
        return;
      }

      const folderPath = path.join(__dirname, "..", "songs", safeFolder);
      await fs.mkdir(folderPath, { recursive: true });

      const coverExt = path.extname(req.file.originalname).toLowerCase() || ".jpg";
      const coverFile = `cover${coverExt}`;
      await fs.writeFile(path.join(folderPath, coverFile), req.file.buffer);

      const playlistId = await getNextId("playlist");
      await Playlist.create({
        playlistId,
        title,
        description,
        folder: safeFolder,
        cover: coverFile
      });

      const info = {
        title,
        description,
        cover: coverFile,
        folder: safeFolder,
        songCovers: {},
        songs: []
      };
      await fs.writeFile(
        path.join(folderPath, "info.json"),
        JSON.stringify(info, null, 4)
      );

      res.json({ ok: true, id: playlistId });
    })
  );

  app.patch(
    "/api/admin/playlists/:id",
    upload.single("cover"),
    requireAuth(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid playlist id" });
        return;
      }

      const playlist = await Playlist.findOne({ playlistId: id }).lean();
      if (!playlist) {
        res.status(404).json({ error: "Playlist not found" });
        return;
      }

      const { title, description } = req.body || {};
      if (!title || !description) {
        res.status(400).json({ error: "Missing fields" });
        return;
      }

      let coverFile = playlist.cover;
      if (req.file) {
        const coverExt = path.extname(req.file.originalname).toLowerCase() || ".jpg";
        coverFile = `cover${coverExt}`;
        const folderPath = ensureInsideSongsRoot(
          path.join(songsRoot, playlist.folder)
        );
        await fs.mkdir(folderPath, { recursive: true });
        await fs.writeFile(path.join(folderPath, coverFile), req.file.buffer);
      }

      await Playlist.updateOne(
        { playlistId: id },
        { title, description, cover: coverFile }
      );

      const infoPath = path.join(songsRoot, playlist.folder, "info.json");
      try {
        const raw = await fs.readFile(infoPath, "utf8");
        const info = JSON.parse(raw);
        const updated = {
          ...(info && typeof info === "object" ? info : {}),
          title,
          description,
          cover: coverFile,
          folder: playlist.folder,
          songCovers: info?.songCovers || {},
          songs: info?.songs || []
        };
        await fs.writeFile(infoPath, JSON.stringify(updated, null, 4));
      } catch (err) {
        // Ignore info.json errors.
      }

      res.json({ ok: true });
    })
  );

  app.delete("/api/admin/playlists/:id", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid playlist id" });
      return;
    }

    const playlist = await Playlist.findOne({ playlistId: id }).lean();
    if (!playlist) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    await Playlist.deleteOne({ playlistId: id });
    const songs = await Song.find({ playlistId: id })
      .select("songId")
      .lean();
    const songIds = songs.map((s) => s.songId);
    if (songIds.length) {
      await LikedSong.deleteMany({ songId: { $in: songIds } });
    }
    await Song.deleteMany({ playlistId: id });
    await LibraryPlaylist.deleteMany({ playlistId: id });

    const folderPath = ensureInsideSongsRoot(
      path.join(songsRoot, playlist.folder)
    );
    await fs.rm(folderPath, { recursive: true, force: true });

    res.json({ ok: true });
  }));

  app.post(
    "/api/admin/songs",
    upload.fields([
      { name: "audio", maxCount: 50 },
      { name: "cover", maxCount: 50 }
    ]),
    requireAuth(async (req, res) => {
      const { playlistId } = req.body || {};
      const id = Number(playlistId);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid playlist id" });
        return;
      }

      const playlist = await Playlist.findOne({ playlistId: id }).lean();
      if (!playlist) {
        res.status(404).json({ error: "Playlist not found" });
        return;
      }

      const audioFiles = req.files?.audio || [];
      if (audioFiles.length === 0) {
        res.status(400).json({ error: "Audio file is required" });
        return;
      }

      const folderPath = path.join(__dirname, "..", "songs", playlist.folder);
      await fs.mkdir(folderPath, { recursive: true });

      const coverFiles = req.files?.cover || [];
      const coverMap = new Map();
      for (const coverFile of coverFiles) {
        const coverName = path.basename(coverFile.originalname);
        const coverBase = path.parse(coverName).name;
        if (!coverMap.has(coverBase)) {
          coverMap.set(coverBase, coverFile);
        }
      }

      const maxTrackRow = await Song.findOne({ playlistId: id })
        .sort({ trackNumber: -1 })
        .select("trackNumber")
        .lean();
      let nextTrack = (maxTrackRow?.trackNumber || 0) + 1;
      let created = 0;

      for (const audioFile of audioFiles) {
        const audioName = path.basename(audioFile.originalname);
        const audioExt = path.extname(audioName) || ".mp3";
        const audioBase = path.parse(audioName).name;
        const finalAudioName = `${audioBase}${audioExt}`;

        await fs.writeFile(
          path.join(folderPath, finalAudioName),
          audioFile.buffer
        );

        const coverFile = coverMap.get(audioBase);
        if (coverFile) {
          const coverExt = path.extname(coverFile.originalname).toLowerCase() || ".jpg";
          const coverName = `${audioBase}${coverExt}`;
          await fs.writeFile(path.join(folderPath, coverName), coverFile.buffer);
        }

        const songId = await getNextId("song");
        await Song.create({
          songId,
          playlistId: id,
          filename: finalAudioName,
          trackNumber: nextTrack
        });
        nextTrack += 1;
        created += 1;

        await updateInfoJsonWithSong(playlist.folder, finalAudioName);
      }

      res.json({ ok: true, created });
    })
  );

  app.patch(
    "/api/admin/songs/:id",
    upload.fields([
      { name: "cover", maxCount: 1 },
      { name: "audio", maxCount: 1 }
    ]),
    requireAuth(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid song id" });
        return;
      }

      const song = await Song.findOne({ songId: id }).lean();
      if (!song) {
        res.status(404).json({ error: "Song not found" });
        return;
      }
      const playlist = await Playlist.findOne({ playlistId: song.playlistId })
        .select("folder")
        .lean();
      if (!playlist) {
        res.status(404).json({ error: "Playlist not found" });
        return;
      }

      const coverFile = req.files?.cover?.[0];
      const audioFile = req.files?.audio?.[0];
      if (!coverFile && !audioFile) {
        res.status(400).json({ error: "Cover or audio file is required" });
        return;
      }

      const base = path.parse(song.filename).name;
      const folderPath = ensureInsideSongsRoot(
        path.join(songsRoot, playlist.folder)
      );
      if (audioFile) {
        await fs.writeFile(
          path.join(folderPath, song.filename),
          audioFile.buffer
        );
      }

      let coverName = null;
      if (coverFile) {
        const coverExt = path.extname(coverFile.originalname).toLowerCase() || ".jpg";
        coverName = `${base}${coverExt}`;
        await fs.writeFile(path.join(folderPath, coverName), coverFile.buffer);
      }

      if (coverName) {
        const infoPath = path.join(songsRoot, playlist.folder, "info.json");
        try {
          const raw = await fs.readFile(infoPath, "utf8");
          const info = JSON.parse(raw);
          if (info && typeof info === "object") {
            if (!info.songCovers || typeof info.songCovers !== "object") {
              info.songCovers = {};
            }
            info.songCovers[song.filename] = coverName;
            await fs.writeFile(infoPath, JSON.stringify(info, null, 4));
          }
        } catch (err) {
          // Ignore info.json errors.
        }
      }

      res.json({ ok: true });
    })
  );

  app.delete("/api/admin/songs/:id", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid song id" });
      return;
    }

    const song = await Song.findOne({ songId: id }).lean();
    if (!song) {
      res.status(404).json({ error: "Song not found" });
      return;
    }
    const playlist = await Playlist.findOne({ playlistId: song.playlistId })
      .select("folder")
      .lean();
    if (!playlist) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    await Song.deleteOne({ songId: id });
    await LikedSong.deleteMany({ songId: id });

    const base = path.parse(song.filename).name;
    const folderPath = ensureInsideSongsRoot(
      path.join(songsRoot, playlist.folder)
    );

    await fs.rm(path.join(folderPath, song.filename), { force: true });

    const coverExts = [".jpg", ".jpeg", ".png", ".webp"];
    for (const ext of coverExts) {
      await fs.rm(path.join(folderPath, `${base}${ext}`), { force: true });
    }

    await removeSongFromInfo(playlist.folder, song.filename);

    res.json({ ok: true });
  }));

  app.post("/api/library/playlists/:id/toggle", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid playlist id" });
      return;
    }

    const existing = await LibraryPlaylist.findOne({
      userId: req.user.id,
      playlistId: id
    }).lean();
    if (existing) {
      await LibraryPlaylist.deleteOne({ userId: req.user.id, playlistId: id });
      res.json({ saved: false });
      return;
    }

    await LibraryPlaylist.create({ userId: req.user.id, playlistId: id });
    res.json({ saved: true });
  }));

  app.post("/api/library/songs/:id/toggle", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid song id" });
      return;
    }

    const existing = await LikedSong.findOne({
      userId: req.user.id,
      songId: id
    }).lean();
    if (existing) {
      await LikedSong.deleteOne({ userId: req.user.id, songId: id });
      res.json({ liked: false });
      return;
    }

    await LikedSong.create({ userId: req.user.id, songId: id });
    res.json({ liked: true });
  }));
  })();

  return appReadyPromise;
}

async function start() {
  await prepareApp();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

module.exports = { app, prepareApp };
