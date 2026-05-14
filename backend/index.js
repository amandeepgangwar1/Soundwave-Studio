require("./env");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const https = require("https");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { connectDb, seedIfEmpty, getNextId, models } = require("./db");
const { getArtistProfile, getSongMetadataOverride } = require("./catalog-data");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const SESSION_DAYS = 7;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const requestedEmbeddingDimensions = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS);
const OPENAI_EMBEDDING_DIMENSIONS =
  Number.isInteger(requestedEmbeddingDimensions) && requestedEmbeddingDimensions > 0
    ? requestedEmbeddingDimensions
    : 512;
const EMBEDDING_BATCH_SIZE = 64;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});
const projectRoot = path.join(__dirname, "..");
const frontendRoot = path.join(projectRoot, "frontend");
const songsRoot = path.join(frontendRoot, "songs");
let openAiClient = null;
let openAiUnavailableLogged = false;

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
  const isAdmin = await isAdminUser(user.id);
  if (!isAdmin) {
    res.redirect("/admin-login.html");
    return;
  }
  next();
});

app.use(express.static(frontendRoot));

const {
  User,
  Session,
  Playlist,
  Artist,
  Album,
  Song,
  LibraryPlaylist,
  LikedSong,
  FollowedArtist,
  UserPlaylist,
  UserPlaylistSong,
  Payment,
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSongMeta(filename) {
  const override = getSongMetadataOverride(filename);
  if (override) return override;

  const clean = path
    .parse(filename)
    .name
    .replace(/^\d+\s*[-_.]?\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  const dashParts = clean.split(" - ").map((part) => part.trim()).filter(Boolean);

  if (dashParts.length >= 2 && !/^\d+$/.test(dashParts[0])) {
    return {
      title: dashParts[1],
      artist: dashParts[0],
      album: dashParts[2] || "Single"
    };
  }

  const underscoreParts = clean.split("_").map((part) => part.trim()).filter(Boolean);
  if (underscoreParts.length >= 2) {
    return {
      title: underscoreParts[0],
      artist: underscoreParts[1],
      album: "Single"
    };
  }

  return {
    title: clean || filename,
    artist: "Various Artists",
    album: "Single"
  };
}

function isPremiumPlan(plan) {
  return ["premium", "premium-monthly", "premium-yearly", "student"].includes(plan);
}

function getPremiumPlan(planKey) {
  const plans = {
    monthly: { subscriptionType: "premium-monthly", amount: 119, label: "Premium Monthly" },
    yearly: { subscriptionType: "premium-yearly", amount: 1188, label: "Premium Yearly" },
    student: { subscriptionType: "student", amount: 59, label: "Student Premium" }
  };
  return plans[planKey] || null;
}

function isSupportedPaymentMethod(method) {
  return new Set(["upi", "debit-card", "credit-card", "net-banking", "wallet"]).has(method);
}

function razorpayRequest(method, endpoint, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : "";
    const request = https.request(
      {
        hostname: "api.razorpay.com",
        path: endpoint,
        method,
        auth: `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (response) => {
        let raw = "";
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (err) {
            data = { error: { description: raw || "Invalid Razorpay response" } };
          }

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(data);
            return;
          }
          const message = data?.error?.description || "Razorpay request failed";
          reject(new Error(message));
        });
      }
    );

    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(signature || ""));
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

async function completeTestGatewayPayment(req, res) {
  const planKey = String(req.body?.plan || "monthly");
  const method = String(req.body?.method || "upi");
  const selected = getPremiumPlan(planKey);

  if (!selected || !isSupportedPaymentMethod(method)) {
    res.status(400).json({ error: "Invalid plan or payment method" });
    return;
  }

  const paymentId = await getNextId("payment");
  const orderId = `test_order_${paymentId}_${Date.now().toString(36)}`;
  const gatewayPaymentId = `test_pay_${crypto.randomBytes(6).toString("hex")}`;
  const gatewaySignature = crypto
    .createHash("sha256")
    .update(`${orderId}|${gatewayPaymentId}|soundwave-test`)
    .digest("hex");

  await Payment.create({
    paymentId,
    userId: req.user.id,
    plan: selected.subscriptionType,
    amount: selected.amount,
    currency: "INR",
    method,
    gateway: "soundwave-test",
    gatewayOrderId: orderId,
    gatewayPaymentId,
    gatewaySignature,
    paymentStatus: "success"
  });
  await User.updateOne(
    { userId: req.user.id },
    { subscriptionType: selected.subscriptionType }
  );

  res.json({
    ok: true,
    gateway: "soundwave-test",
    orderId,
    gatewayPaymentId,
    subscriptionType: selected.subscriptionType,
    premium: true
  });
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
    const filePath = path.join(songsRoot, folder, `${base}${ext}`);
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

async function getOrCreateArtist(name, bio = "") {
  const cleanName = String(name || "Various Artists").trim() || "Various Artists";
  const profile = getArtistProfile(cleanName);
  const existing = await Artist.findOne({ name: cleanName }).lean();
  if (existing) {
    const update = {};
    if (profile?.bio && !existing.bio) update.bio = profile.bio;
    if (profile?.imageUrl && (!existing.imageUrl || existing.imageUrl === "/img/music.svg")) {
      update.imageUrl = profile.imageUrl;
    }
    if (Object.keys(update).length) {
      await Artist.updateOne({ artistId: existing.artistId }, update);
      return { ...existing, ...update };
    }
    return existing;
  }

  const artistId = await getNextId("artist");
  const created = await Artist.create({
    artistId,
    name: cleanName,
    bio: bio || profile?.bio || `${cleanName} on Soundwave Studio.`,
    imageUrl: profile?.imageUrl || "/img/music.svg"
  });
  return created.toObject();
}

async function getOrCreateAlbum(title, artistId, coverImage = "") {
  const cleanTitle = String(title || "Single").trim() || "Single";
  const existing = await Album.findOne({ title: cleanTitle, artistId }).lean();
  if (existing) return existing;

  const albumId = await getNextId("album");
  const created = await Album.create({
    albumId,
    title: cleanTitle,
    artistId,
    coverImage
  });
  return created.toObject();
}

async function ensureCatalogMetadata() {
  const playlists = await Playlist.find().select("playlistId title folder cover").lean();
  const playlistMap = new Map(playlists.map((playlist) => [playlist.playlistId, playlist]));
  const songs = await Song.find().select("songId playlistId filename title artistId albumId genre fileUrl").lean();

  for (const song of songs) {
    const playlist = playlistMap.get(song.playlistId);
    if (!playlist) continue;

    const meta = parseSongMeta(song.filename);
    const artist = await getOrCreateArtist(meta.artist);
    const albumTitle = meta.album === "Single" ? playlist.title : meta.album;
    const album = await getOrCreateAlbum(
      albumTitle,
      artist.artistId,
      `/songs/${playlist.folder}/${playlist.cover}`
    );

    const update = {};
    if (!song.title) update.title = meta.title;
    if (!song.artistId) update.artistId = artist.artistId;
    if (!song.albumId) update.albumId = album.albumId;
    if (!song.genre) update.genre = "Music";
    if (!song.fileUrl) update.fileUrl = `/songs/${playlist.folder}/${song.filename}`;

    if (Object.keys(update).length) {
      await Song.updateOne({ songId: song.songId }, update);
    }
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
  return {
    id: user.userId,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    subscriptionType: user.subscriptionType || "free"
  };
}

async function isAdminUser(userId) {
  if (!userId) return false;
  const admin = await AdminUser.findOne({ userId }).lean();
  return Boolean(admin);
}

function requireAuth(handler) {
  return async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = user;
    await handler(req, res);
  };
}

function requireAdmin(handler) {
  return requireAuth(async (req, res) => {
    const ok = await isAdminUser(req.user.id);
    if (!ok) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    await handler(req, res);
  });
}

function toPlaylistDto(row) {
  return {
    id: row.playlistId,
    title: row.title,
    description: row.description,
    folder: row.folder,
    coverUrl: `/songs/${row.folder}/${row.cover}`
  };
}

function toArtistDto(row, followedIds = new Set()) {
  return {
    id: row.artistId,
    name: row.name,
    bio: row.bio || "",
    imageUrl: row.imageUrl || "/img/music.svg",
    followed: followedIds.has(row.artistId)
  };
}

function toAlbumDto(row, artistMap = new Map()) {
  const artist = artistMap.get(row.artistId);
  return {
    id: row.albumId,
    title: row.title,
    artistId: row.artistId,
    artistName: artist ? artist.name : "Various Artists",
    releaseDate: row.releaseDate,
    coverImage: row.coverImage || "/img/music.svg"
  };
}

function toSongDto(row, playlistMap = new Map(), artistMap = new Map(), albumMap = new Map()) {
  const fallbackMeta = parseSongMeta(row.filename);
  const playlist = playlistMap.get(row.playlistId);
  const artist = artistMap.get(row.artistId);
  const album = albumMap.get(row.albumId);
  return {
    id: row.songId,
    title: row.title || fallbackMeta.title,
    filename: row.filename,
    artistId: row.artistId,
    artistName: artist ? artist.name : fallbackMeta.artist,
    albumId: row.albumId,
    albumTitle: album ? album.title : "",
    genre: row.genre || "Music",
    duration: row.duration || 0,
    playlistId: row.playlistId,
    playlistTitle: playlist ? playlist.title : "",
    fileUrl: row.fileUrl || (playlist ? `/songs/${playlist.folder}/${row.filename}` : ""),
    coverUrl: playlist ? `/songs/${playlist.folder}/${playlist.cover}` : "/img/music.svg"
  };
}

function hasOpenAiConfig() {
  return Boolean(OPENAI_API_KEY);
}

function getOpenAiClient() {
  if (!hasOpenAiConfig()) return null;
  if (openAiClient) return openAiClient;

  try {
    const OpenAI = require("openai");
    const OpenAIClient = OpenAI.default || OpenAI;
    openAiClient = new OpenAIClient({ apiKey: OPENAI_API_KEY });
    return openAiClient;
  } catch (err) {
    if (!openAiUnavailableLogged) {
      console.warn(
        `OpenAI embeddings disabled. Install the openai package to enable AI recommendations: ${err.message}`
      );
      openAiUnavailableLogged = true;
    }
    return null;
  }
}

function isUsableEmbedding(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => Number.isFinite(item));
}

function cosineSimilarity(left, right) {
  if (!isUsableEmbedding(left) || !isUsableEmbedding(right) || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function averageEmbeddings(embeddings) {
  const valid = embeddings.filter(isUsableEmbedding);
  if (!valid.length) return null;

  const dimensions = valid[0].length;
  const totals = Array.from({ length: dimensions }, () => 0);
  let used = 0;

  for (const embedding of valid) {
    if (embedding.length !== dimensions) continue;
    for (let index = 0; index < dimensions; index += 1) {
      totals[index] += embedding[index];
    }
    used += 1;
  }

  if (!used) return null;
  return totals.map((value) => value / used);
}

function buildSongEmbeddingText(song, playlistMap = new Map(), artistMap = new Map(), albumMap = new Map()) {
  const fallbackMeta = parseSongMeta(song.filename);
  const playlist = playlistMap.get(song.playlistId);
  const artist = artistMap.get(song.artistId);
  const album = albumMap.get(song.albumId);
  const fields = [
    `Title: ${song.title || fallbackMeta.title}`,
    `Artist: ${artist ? artist.name : fallbackMeta.artist}`,
    `Album: ${album ? album.title : fallbackMeta.album}`,
    `Genre: ${song.genre || "Music"}`
  ];

  if (playlist) {
    fields.push(`Playlist: ${playlist.title}`);
    if (playlist.description) fields.push(`Playlist description: ${playlist.description}`);
  }

  return fields.join("\n").slice(0, 4000);
}

function hasFreshSongEmbedding(song, text) {
  return (
    isUsableEmbedding(song.embedding) &&
    song.embeddingModel === OPENAI_EMBEDDING_MODEL &&
    song.embeddingDimensions === OPENAI_EMBEDDING_DIMENSIONS &&
    song.embeddingText === text
  );
}

async function createEmbeddings(inputs) {
  const client = getOpenAiClient();
  if (!client || !inputs.length) return [];

  const response = await client.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: inputs,
    dimensions: OPENAI_EMBEDDING_DIMENSIONS
  });

  return response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

async function getSongMetadataMaps(songs) {
  const playlistIds = Array.from(new Set(songs.map((song) => song.playlistId).filter(Boolean)));
  const artistIds = Array.from(new Set(songs.map((song) => song.artistId).filter(Boolean)));
  const albumIds = Array.from(new Set(songs.map((song) => song.albumId).filter(Boolean)));

  const [playlists, artists, albums] = await Promise.all([
    playlistIds.length ? Playlist.find({ playlistId: { $in: playlistIds } }).lean() : [],
    artistIds.length ? Artist.find({ artistId: { $in: artistIds } }).lean() : [],
    albumIds.length ? Album.find({ albumId: { $in: albumIds } }).lean() : []
  ]);

  return {
    playlists,
    artists,
    albums,
    playlistMap: new Map(playlists.map((playlist) => [playlist.playlistId, playlist])),
    artistMap: new Map(artists.map((artist) => [artist.artistId, artist])),
    albumMap: new Map(albums.map((album) => [album.albumId, album]))
  };
}

async function ensureSongEmbeddings(songs, metadata) {
  if (!hasOpenAiConfig()) return new Map();

  const uniqueSongs = Array.from(
    new Map(songs.filter(Boolean).map((song) => [song.songId, song])).values()
  );
  const embeddingMap = new Map();
  const pending = [];

  for (const song of uniqueSongs) {
    const text = buildSongEmbeddingText(
      song,
      metadata.playlistMap,
      metadata.artistMap,
      metadata.albumMap
    );
    if (hasFreshSongEmbedding(song, text)) {
      embeddingMap.set(song.songId, song.embedding);
      continue;
    }
    pending.push({ song, text });
  }

  for (let index = 0; index < pending.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = pending.slice(index, index + EMBEDDING_BATCH_SIZE);
    const embeddings = await createEmbeddings(batch.map((item) => item.text));

    await Promise.all(
      batch.map(async (item, itemIndex) => {
        const embedding = embeddings[itemIndex];
        if (!isUsableEmbedding(embedding)) return;

        embeddingMap.set(item.song.songId, embedding);
        await Song.updateOne(
          { songId: item.song.songId },
          {
            embedding,
            embeddingModel: OPENAI_EMBEDDING_MODEL,
            embeddingDimensions: OPENAI_EMBEDDING_DIMENSIONS,
            embeddingText: item.text,
            embeddingUpdatedAt: new Date()
          }
        );
      })
    );
  }

  return embeddingMap;
}

let appReadyPromise;

async function prepareApp() {
  if (appReadyPromise) return appReadyPromise;

  appReadyPromise = (async () => {
  await connectDb();
  await seedIfEmpty();
  await syncPlaylistsWithFolders();
  await ensureCatalogMetadata();
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
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      subscriptionType: user.subscriptionType
    });
  });

  app.post("/api/auth/signup", async (req, res) => {
    const { name, email, phone, password, provider } = req.body || {};
    const cleanName = String(name || "").trim();
    const cleanPhone = String(phone || "").trim();
    let normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail && cleanPhone) {
      const phoneKey = cleanPhone.replace(/\D/g, "") || cleanPhone.replace(/\s+/g, "");
      normalizedEmail = `${phoneKey}@phone.soundwave.local`;
    }
    if (!cleanName || (!normalizedEmail && !cleanPhone) || !password) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }

    const existing = await User.findOne({
      $or: [{ email: normalizedEmail }, ...(cleanPhone ? [{ phone: cleanPhone }] : [])]
    }).lean();
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
      phone: cleanPhone,
      authProvider: String(provider || "email").trim() || "email",
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
    const { name, email, phone, password } = req.body || {};
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
      phone: String(phone || "").trim(),
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
    const loginId = String(email || "").trim();
    const normalizedEmail = loginId.toLowerCase();
    if (!loginId || !password) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }

    const user = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: loginId }]
    }).lean();
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
    const loginId = String(email || "").trim();
    const normalizedEmail = loginId.toLowerCase();
    if (!loginId || !password) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }

    const user = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: loginId }]
    }).lean();
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const admin = await AdminUser.findOne({ userId: user.userId }).lean();
    if (!admin) {
      res.status(403).json({ error: "Admin access required" });
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
    res.json(rows.map(toPlaylistDto));
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
      .select("songId filename title artistId albumId genre duration fileUrl")
      .lean();

    const songCoverMap = await loadSongCoverMap(playlist.folder);
    const artistIds = Array.from(new Set(songs.map((song) => song.artistId).filter(Boolean)));
    const albumIds = Array.from(new Set(songs.map((song) => song.albumId).filter(Boolean)));
    const artists = artistIds.length
      ? await Artist.find({ artistId: { $in: artistIds } }).lean()
      : [];
    const albums = albumIds.length
      ? await Album.find({ albumId: { $in: albumIds } }).lean()
      : [];
    const artistMap = new Map(artists.map((artist) => [artist.artistId, artist]));
    const albumMap = new Map(albums.map((album) => [album.albumId, album]));
    const playlistMap = new Map([[playlist.playlistId, playlist]]);
    const songsWithCovers = await Promise.all(
      songs.map(async (row) => ({
        ...toSongDto(row, playlistMap, artistMap, albumMap),
        coverUrl:
          songCoverMap.get(row.filename) ||
          (await resolveSongCover(playlist.folder, row.filename))
          || `/songs/${playlist.folder}/${playlist.cover}`
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

  app.get("/api/search", requireAuth(async (req, res) => {
    const query = String(req.query.q || "").trim();
    const regex = query ? new RegExp(escapeRegExp(query), "i") : null;
    const limit = Math.min(Number(req.query.limit) || 12, 30);

    const playlistRows = await Playlist.find(
      regex ? { $or: [{ title: regex }, { description: regex }] } : {}
    )
      .sort({ title: 1 })
      .limit(limit)
      .lean();

    const artistRows = await Artist.find(
      regex ? { $or: [{ name: regex }, { bio: regex }] } : {}
    )
      .sort({ name: 1 })
      .limit(limit)
      .lean();

    const artistIdsFromSearch = artistRows.map((artist) => artist.artistId);
    const albumRows = await Album.find(
      regex
        ? { $or: [{ title: regex }, { artistId: { $in: artistIdsFromSearch } }] }
        : {}
    )
      .sort({ title: 1 })
      .limit(limit)
      .lean();
    const albumIdsFromSearch = albumRows.map((album) => album.albumId);

    const songFilter = regex
      ? {
          $or: [
            { title: regex },
            { filename: regex },
            { genre: regex },
            { artistId: { $in: artistIdsFromSearch } },
            { albumId: { $in: albumIdsFromSearch } }
          ]
        }
      : {};
    const songRows = await Song.find(songFilter)
      .sort({ trackNumber: 1 })
      .limit(limit)
      .lean();

    const artistIds = Array.from(
      new Set([
        ...artistRows.map((artist) => artist.artistId),
        ...albumRows.map((album) => album.artistId),
        ...songRows.map((song) => song.artistId)
      ].filter(Boolean))
    );
    const albumIds = Array.from(
      new Set([
        ...albumRows.map((album) => album.albumId),
        ...songRows.map((song) => song.albumId)
      ].filter(Boolean))
    );
    const playlistIds = Array.from(new Set(songRows.map((song) => song.playlistId)));

    const [artistDocs, albumDocs, playlistDocs, followedRows] = await Promise.all([
      artistIds.length ? Artist.find({ artistId: { $in: artistIds } }).lean() : [],
      albumIds.length ? Album.find({ albumId: { $in: albumIds } }).lean() : [],
      playlistIds.length ? Playlist.find({ playlistId: { $in: playlistIds } }).lean() : [],
      FollowedArtist.find({ userId: req.user.id }).lean()
    ]);
    const followedIds = new Set(followedRows.map((row) => row.artistId));
    const artistMap = new Map(artistDocs.map((artist) => [artist.artistId, artist]));
    const albumMap = new Map(albumDocs.map((album) => [album.albumId, album]));
    const playlistMap = new Map(playlistDocs.map((playlist) => [playlist.playlistId, playlist]));

    res.json({
      songs: songRows.map((song) => toSongDto(song, playlistMap, artistMap, albumMap)),
      artists: artistRows.map((artist) => toArtistDto(artist, followedIds)),
      albums: albumRows.map((album) => toAlbumDto(album, artistMap)),
      playlists: playlistRows.map(toPlaylistDto),
      podcasts: query
        ? [
            {
              id: "music-talk",
              title: `${query} Music Talk`,
              description: "Podcast placeholder for future audio shows."
            }
          ]
        : []
    });
  }));

  app.get("/api/recommendations", requireAuth(async (req, res) => {
    const [likedRows, followedRows, savedRows, userPlaylistRows, allSongs] = await Promise.all([
      LikedSong.find({ userId: req.user.id }).lean(),
      FollowedArtist.find({ userId: req.user.id }).lean(),
      LibraryPlaylist.find({ userId: req.user.id }).lean(),
      UserPlaylistSong.find({ userId: req.user.id }).lean(),
      Song.find().sort({ trackNumber: 1 }).limit(150).lean()
    ]);

    const likedIds = new Set(likedRows.map((row) => row.songId));
    const likedSongs = likedRows.length
      ? await Song.find({ songId: { $in: Array.from(likedIds) } }).lean()
      : [];
    const likedArtistIds = new Set(likedSongs.map((song) => song.artistId).filter(Boolean));
    const followedArtistIds = new Set(followedRows.map((row) => row.artistId));
    const savedPlaylistIds = new Set(savedRows.map((row) => row.playlistId));
    const userPlaylistSongIds = new Set(userPlaylistRows.map((row) => row.songId));

    const scored = allSongs
      .filter((song) => !likedIds.has(song.songId))
      .map((song) => {
        let score = 1;
        if (followedArtistIds.has(song.artistId)) score += 6;
        if (likedArtistIds.has(song.artistId)) score += 4;
        if (savedPlaylistIds.has(song.playlistId)) score += 3;
        if (userPlaylistSongIds.has(song.songId)) score += 2;
        score += Math.max(0, 8 - Number(song.trackNumber || 8)) / 10;
        return { song, score };
      });

    const songsForMetadata = [
      ...likedSongs,
      ...scored.map((item) => item.song)
    ];
    const metadata = await getSongMetadataMaps(songsForMetadata);
    let aiRecommendationsUsed = false;

    if (likedSongs.length && scored.length && hasOpenAiConfig()) {
      try {
        const embeddingMap = await ensureSongEmbeddings(songsForMetadata, metadata);
        const tasteEmbedding = averageEmbeddings(
          likedSongs.map((song) => embeddingMap.get(song.songId))
        );

        if (tasteEmbedding) {
          aiRecommendationsUsed = true;
          for (const item of scored) {
            const songEmbedding = embeddingMap.get(item.song.songId);
            const similarity = cosineSimilarity(tasteEmbedding, songEmbedding);
            item.score += Math.max(0, similarity) * 10;
          }
        }
      } catch (err) {
        console.warn(`AI recommendations unavailable: ${err.message}`);
      }
    }

    const ranked = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((item) => item.song);

    res.json({
      songs: ranked.map((song) =>
        toSongDto(
          song,
          metadata.playlistMap,
          metadata.artistMap,
          metadata.albumMap
        )
      ),
      ai: {
        configured: hasOpenAiConfig(),
        used: aiRecommendationsUsed,
        model: aiRecommendationsUsed ? OPENAI_EMBEDDING_MODEL : null
      }
    });
  }));

  app.get("/api/artists", requireAuth(async (req, res) => {
    const [artists, followedRows, songCounts] = await Promise.all([
      Artist.find().sort({ name: 1 }).lean(),
      FollowedArtist.find({ userId: req.user.id }).lean(),
      Song.aggregate([{ $group: { _id: "$artistId", count: { $sum: 1 } } }])
    ]);
    const followedIds = new Set(followedRows.map((row) => row.artistId));
    const countMap = new Map(songCounts.map((row) => [row._id, row.count]));

    res.json(artists.map((artist) => ({
      ...toArtistDto(artist, followedIds),
      songCount: countMap.get(artist.artistId) || 0
    })));
  }));

  app.get("/api/artists/:id", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid artist id" });
      return;
    }

    const [artist, followed, songs, albums] = await Promise.all([
      Artist.findOne({ artistId: id }).lean(),
      FollowedArtist.findOne({ userId: req.user.id, artistId: id }).lean(),
      Song.find({ artistId: id }).sort({ trackNumber: 1 }).lean(),
      Album.find({ artistId: id }).sort({ title: 1 }).lean()
    ]);
    if (!artist) {
      res.status(404).json({ error: "Artist not found" });
      return;
    }

    const playlistIds = Array.from(new Set(songs.map((song) => song.playlistId)));
    const playlists = playlistIds.length
      ? await Playlist.find({ playlistId: { $in: playlistIds } }).lean()
      : [];
    const artistMap = new Map([[artist.artistId, artist]]);
    const albumMap = new Map(albums.map((album) => [album.albumId, album]));
    const playlistMap = new Map(playlists.map((playlist) => [playlist.playlistId, playlist]));

    res.json({
      artist: toArtistDto(artist, followed ? new Set([id]) : new Set()),
      albums: albums.map((album) => toAlbumDto(album, artistMap)),
      songs: songs.map((song) => toSongDto(song, playlistMap, artistMap, albumMap))
    });
  }));

  app.post("/api/artists/:id/follow/toggle", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid artist id" });
      return;
    }

    const artist = await Artist.findOne({ artistId: id }).lean();
    if (!artist) {
      res.status(404).json({ error: "Artist not found" });
      return;
    }

    const existing = await FollowedArtist.findOne({
      userId: req.user.id,
      artistId: id
    }).lean();
    if (existing) {
      await FollowedArtist.deleteOne({ userId: req.user.id, artistId: id });
      res.json({ followed: false });
      return;
    }

    await FollowedArtist.create({ userId: req.user.id, artistId: id });
    res.json({ followed: true });
  }));

  app.get("/api/albums", requireAuth(async (req, res) => {
    const albums = await Album.find().sort({ title: 1 }).lean();
    const artistIds = Array.from(new Set(albums.map((album) => album.artistId).filter(Boolean)));
    const artists = artistIds.length
      ? await Artist.find({ artistId: { $in: artistIds } }).lean()
      : [];
    const artistMap = new Map(artists.map((artist) => [artist.artistId, artist]));
    res.json(albums.map((album) => toAlbumDto(album, artistMap)));
  }));

  app.get("/api/subscription", requireAuth(async (req, res) => {
    const payments = await Payment.find({ userId: req.user.id })
      .sort({ paymentDate: -1 })
      .limit(10)
      .lean();
    res.json({
      subscriptionType: req.user.subscriptionType || "free",
      premium: isPremiumPlan(req.user.subscriptionType),
      payments: payments.map((payment) => ({
        id: payment.paymentId,
        plan: payment.plan,
        amount: payment.amount,
        method: payment.method,
        gateway: payment.gateway || "soundwave-test",
        gatewayPaymentId: payment.gatewayPaymentId || "",
        status: payment.paymentStatus,
        paymentDate: payment.paymentDate
      }))
    });
  }));

  app.post("/api/payments/create-order", requireAuth(async (req, res) => {
    const planKey = String(req.body?.plan || "monthly");
    const method = String(req.body?.method || "upi");
    const selected = getPremiumPlan(planKey);

    if (!selected || !isSupportedPaymentMethod(method)) {
      res.status(400).json({ error: "Invalid plan or payment method" });
      return;
    }

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      res.status(503).json({
        error: "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
      });
      return;
    }

    const paymentId = await getNextId("payment");
    const receipt = `sw_${paymentId}_${Date.now().toString(36)}`;
    let order;
    try {
      order = await razorpayRequest("POST", "/v1/orders", {
        amount: selected.amount * 100,
        currency: "INR",
        receipt,
        notes: {
          paymentId: String(paymentId),
          userId: String(req.user.id),
          plan: selected.subscriptionType,
          method
        }
      });
    } catch (err) {
      res.status(502).json({ error: err.message || "Could not create Razorpay order" });
      return;
    }

    await Payment.create({
      paymentId,
      userId: req.user.id,
      plan: selected.subscriptionType,
      amount: selected.amount,
      currency: "INR",
      method,
      gateway: "razorpay",
      gatewayOrderId: order.id,
      paymentStatus: "created"
    });

    res.json({
      keyId: RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      paymentId,
      plan: selected.subscriptionType,
      label: selected.label,
      name: "Soundwave Studio",
      description: selected.label,
      prefill: {
        name: req.user.name,
        email: req.user.email && req.user.email.endsWith("@phone.soundwave.local") ? "" : req.user.email,
        contact: req.user.phone || ""
      }
    });
  }));

  app.post("/api/payments/verify", requireAuth(async (req, res) => {
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: signature
    } = req.body || {};

    if (!orderId || !razorpayPaymentId || !signature) {
      res.status(400).json({ error: "Missing Razorpay payment fields" });
      return;
    }

    if (!RAZORPAY_KEY_SECRET) {
      res.status(503).json({ error: "Razorpay is not configured." });
      return;
    }

    const payment = await Payment.findOne({
      userId: req.user.id,
      gatewayOrderId: orderId
    }).lean();
    if (!payment) {
      res.status(404).json({ error: "Payment order not found" });
      return;
    }

    if (!verifyRazorpaySignature(orderId, razorpayPaymentId, signature)) {
      await Payment.updateOne(
        { paymentId: payment.paymentId },
        {
          paymentStatus: "failed",
          gatewayPaymentId: razorpayPaymentId,
          gatewaySignature: signature
        }
      );
      res.status(400).json({ error: "Payment signature verification failed" });
      return;
    }

    await Payment.updateOne(
      { paymentId: payment.paymentId },
      {
        paymentStatus: "success",
        gatewayPaymentId: razorpayPaymentId,
        gatewaySignature: signature,
        paymentDate: new Date()
      }
    );
    await User.updateOne(
      { userId: req.user.id },
      { subscriptionType: payment.plan }
    );

    res.json({
      ok: true,
      subscriptionType: payment.plan,
      premium: true
    });
  }));

  app.post("/api/payments/test-gateway", requireAuth(completeTestGatewayPayment));

  app.post("/api/payments", requireAuth(completeTestGatewayPayment));

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
          .select("songId filename playlistId title artistId albumId genre duration fileUrl")
          .lean()
      : [];
    const songMap = new Map(songRows.map((row) => [row.songId, row]));

    const playlistIdsForSongs = Array.from(
      new Set(songRows.map((row) => row.playlistId))
    );
    const playlistRowsForSongs = playlistIdsForSongs.length
      ? await Playlist.find({ playlistId: { $in: playlistIdsForSongs } })
          .select("playlistId title description folder cover")
          .lean()
      : [];
    const playlistMapForSongs = new Map(
      playlistRowsForSongs.map((row) => [row.playlistId, row])
    );
    const artistIdsForSongs = Array.from(new Set(songRows.map((row) => row.artistId).filter(Boolean)));
    const albumIdsForSongs = Array.from(new Set(songRows.map((row) => row.albumId).filter(Boolean)));
    const [artistRowsForSongs, albumRowsForSongs, followedRows] = await Promise.all([
      artistIdsForSongs.length ? Artist.find({ artistId: { $in: artistIdsForSongs } }).lean() : [],
      albumIdsForSongs.length ? Album.find({ albumId: { $in: albumIdsForSongs } }).lean() : [],
      FollowedArtist.find({ userId: req.user.id }).lean()
    ]);
    const artistMapForSongs = new Map(artistRowsForSongs.map((row) => [row.artistId, row]));
    const albumMapForSongs = new Map(albumRowsForSongs.map((row) => [row.albumId, row]));
    const followedArtistIds = followedRows.map((row) => row.artistId);
    const followedArtists = followedArtistIds.length
      ? await Artist.find({ artistId: { $in: followedArtistIds } }).lean()
      : [];

    res.json({
      playlists: playlistIds
        .map((id) => playlistMap.get(id))
        .filter(Boolean)
        .map(toPlaylistDto),
      songs: likedRows
        .map((row) => songMap.get(row.songId))
        .filter(Boolean)
        .map((song) => toSongDto(song, playlistMapForSongs, artistMapForSongs, albumMapForSongs)),
      followedArtists: followedArtists.map((artist) =>
        toArtistDto(artist, new Set(followedArtistIds))
      )
    });
  }));

  app.get("/api/user-playlists", requireAuth(async (req, res) => {
    const lists = await UserPlaylist.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .lean();
    const listIds = lists.map((list) => list.userPlaylistId);
    const links = listIds.length
      ? await UserPlaylistSong.find({ userPlaylistId: { $in: listIds }, userId: req.user.id })
          .sort({ createdAt: -1 })
          .lean()
      : [];
    const songIds = Array.from(new Set(links.map((link) => link.songId)));
    const songs = songIds.length
      ? await Song.find({ songId: { $in: songIds } }).lean()
      : [];
    const playlistIds = Array.from(new Set(songs.map((song) => song.playlistId)));
    const artistIds = Array.from(new Set(songs.map((song) => song.artistId).filter(Boolean)));
    const albumIds = Array.from(new Set(songs.map((song) => song.albumId).filter(Boolean)));
    const [playlists, artists, albums] = await Promise.all([
      playlistIds.length ? Playlist.find({ playlistId: { $in: playlistIds } }).lean() : [],
      artistIds.length ? Artist.find({ artistId: { $in: artistIds } }).lean() : [],
      albumIds.length ? Album.find({ albumId: { $in: albumIds } }).lean() : []
    ]);

    const songMap = new Map(songs.map((song) => [song.songId, song]));
    const playlistMap = new Map(playlists.map((playlist) => [playlist.playlistId, playlist]));
    const artistMap = new Map(artists.map((artist) => [artist.artistId, artist]));
    const albumMap = new Map(albums.map((album) => [album.albumId, album]));

    res.json(lists.map((list) => {
      const listSongs = links
        .filter((link) => link.userPlaylistId === list.userPlaylistId)
        .map((link) => songMap.get(link.songId))
        .filter(Boolean)
        .map((song) => toSongDto(song, playlistMap, artistMap, albumMap));

      return {
        id: list.userPlaylistId,
        name: list.name,
        description: list.description || "",
        isShared: list.isShared,
        shareToken: list.shareToken,
        shareUrl: list.isShared && list.shareToken
          ? `/shared-playlist.html?token=${list.shareToken}`
          : "",
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        songs: listSongs
      };
    }));
  }));

  app.post("/api/user-playlists", requireAuth(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    if (!name) {
      res.status(400).json({ error: "Playlist name is required" });
      return;
    }

    const userPlaylistId = await getNextId("userPlaylist");
    const playlist = await UserPlaylist.create({
      userPlaylistId,
      userId: req.user.id,
      name,
      description
    });
    res.json({
      id: playlist.userPlaylistId,
      name: playlist.name,
      description: playlist.description,
      songs: []
    });
  }));

  app.patch("/api/user-playlists/:id", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    if (!Number.isInteger(id) || !name) {
      res.status(400).json({ error: "Invalid playlist update" });
      return;
    }

    const result = await UserPlaylist.updateOne(
      { userPlaylistId: id, userId: req.user.id },
      { name, description, updatedAt: new Date() }
    );
    if (!result.matchedCount) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }
    res.json({ ok: true });
  }));

  app.delete("/api/user-playlists/:id", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid playlist id" });
      return;
    }

    await UserPlaylist.deleteOne({ userPlaylistId: id, userId: req.user.id });
    await UserPlaylistSong.deleteMany({ userPlaylistId: id, userId: req.user.id });
    res.json({ ok: true });
  }));

  app.post("/api/user-playlists/:id/songs", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    const songId = Number(req.body?.songId);
    if (!Number.isInteger(id) || !Number.isInteger(songId)) {
      res.status(400).json({ error: "Invalid song or playlist id" });
      return;
    }

    const [playlist, song] = await Promise.all([
      UserPlaylist.findOne({ userPlaylistId: id, userId: req.user.id }).lean(),
      Song.findOne({ songId }).lean()
    ]);
    if (!playlist || !song) {
      res.status(404).json({ error: "Playlist or song not found" });
      return;
    }

    await UserPlaylistSong.updateOne(
      { userPlaylistId: id, userId: req.user.id, songId },
      { $setOnInsert: { userPlaylistId: id, userId: req.user.id, songId } },
      { upsert: true }
    );
    await UserPlaylist.updateOne(
      { userPlaylistId: id, userId: req.user.id },
      { updatedAt: new Date() }
    );
    res.json({ ok: true });
  }));

  app.delete("/api/user-playlists/:id/songs/:songId", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    const songId = Number(req.params.songId);
    if (!Number.isInteger(id) || !Number.isInteger(songId)) {
      res.status(400).json({ error: "Invalid song or playlist id" });
      return;
    }

    await UserPlaylistSong.deleteOne({
      userPlaylistId: id,
      userId: req.user.id,
      songId
    });
    await UserPlaylist.updateOne(
      { userPlaylistId: id, userId: req.user.id },
      { updatedAt: new Date() }
    );
    res.json({ ok: true });
  }));

  app.post("/api/user-playlists/:id/share", requireAuth(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid playlist id" });
      return;
    }

    const playlist = await UserPlaylist.findOne({ userPlaylistId: id, userId: req.user.id }).lean();
    if (!playlist) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    const shareToken = playlist.shareToken || crypto.randomBytes(8).toString("hex");
    await UserPlaylist.updateOne(
      { userPlaylistId: id, userId: req.user.id },
      { isShared: true, shareToken, updatedAt: new Date() }
    );
    res.json({ shareUrl: `/shared-playlist.html?token=${shareToken}` });
  }));

  app.get("/api/shared-playlists/:token", async (req, res) => {
    const token = String(req.params.token || "");
    const playlist = await UserPlaylist.findOne({ shareToken: token, isShared: true }).lean();
    if (!playlist) {
      res.status(404).json({ error: "Shared playlist not found" });
      return;
    }

    const links = await UserPlaylistSong.find({ userPlaylistId: playlist.userPlaylistId })
      .sort({ createdAt: -1 })
      .lean();
    const songIds = links.map((link) => link.songId);
    const songs = songIds.length ? await Song.find({ songId: { $in: songIds } }).lean() : [];
    const playlistIds = Array.from(new Set(songs.map((song) => song.playlistId)));
    const artistIds = Array.from(new Set(songs.map((song) => song.artistId).filter(Boolean)));
    const albumIds = Array.from(new Set(songs.map((song) => song.albumId).filter(Boolean)));
    const [sourcePlaylists, artists, albums] = await Promise.all([
      playlistIds.length ? Playlist.find({ playlistId: { $in: playlistIds } }).lean() : [],
      artistIds.length ? Artist.find({ artistId: { $in: artistIds } }).lean() : [],
      albumIds.length ? Album.find({ albumId: { $in: albumIds } }).lean() : []
    ]);

    res.json({
      id: playlist.userPlaylistId,
      name: playlist.name,
      description: playlist.description,
      songs: songs.map((song) =>
        toSongDto(
          song,
          new Map(sourcePlaylists.map((row) => [row.playlistId, row])),
          new Map(artists.map((row) => [row.artistId, row])),
          new Map(albums.map((row) => [row.albumId, row]))
        )
      )
    });
  });

  app.get("/api/admin/check", requireAdmin(async (req, res) => {
    res.json({ ok: true });
  }));

  app.get("/api/admin/reports", requireAdmin(async (req, res) => {
    const [
      users,
      premiumUsers,
      playlists,
      songs,
      artists,
      albums,
      savedPlaylists,
      likedSongs,
      follows,
      userPlaylists,
      payments,
      revenueRows,
      topLikedRows
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ subscriptionType: { $ne: "free" } }),
      Playlist.countDocuments(),
      Song.countDocuments(),
      Artist.countDocuments(),
      Album.countDocuments(),
      LibraryPlaylist.countDocuments(),
      LikedSong.countDocuments(),
      FollowedArtist.countDocuments(),
      UserPlaylist.countDocuments(),
      Payment.countDocuments(),
      Payment.aggregate([
        { $match: { paymentStatus: "success" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      LikedSong.aggregate([
        { $group: { _id: "$songId", likes: { $sum: 1 } } },
        { $sort: { likes: -1 } },
        { $limit: 5 }
      ])
    ]);

    const topSongIds = topLikedRows.map((row) => row._id);
    const topSongDocs = topSongIds.length
      ? await Song.find({ songId: { $in: topSongIds } }).lean()
      : [];
    const topSongMap = new Map(topSongDocs.map((song) => [song.songId, song]));

    res.json({
      totals: {
        users,
        premiumUsers,
        playlists,
        songs,
        artists,
        albums,
        savedPlaylists,
        likedSongs,
        follows,
        userPlaylists,
        payments,
        revenue: revenueRows[0]?.total || 0
      },
      topSongs: topLikedRows.map((row) => {
        const song = topSongMap.get(row._id);
        return {
          id: row._id,
          title: song ? song.title || parseSongMeta(song.filename).title : `Song ${row._id}`,
          likes: row.likes
        };
      })
    });
  }));

  app.get("/api/admin/users", requireAdmin(async (req, res) => {
    const [users, admins] = await Promise.all([
      User.find()
        .sort({ createdAt: -1 })
        .select("userId name email phone subscriptionType createdAt")
        .lean(),
      AdminUser.find().lean()
    ]);
    const adminIds = new Set(admins.map((admin) => admin.userId));
    res.json(users.map((user) => ({
      id: user.userId,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      subscriptionType: user.subscriptionType || "free",
      isAdmin: adminIds.has(user.userId),
      createdAt: user.createdAt
    })));
  }));

  app.patch("/api/admin/users/:id", requireAdmin(async (req, res) => {
    const id = Number(req.params.id);
    const allowedPlans = new Set(["free", "premium", "premium-monthly", "premium-yearly", "student"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    const update = {};
    if (req.body?.subscriptionType) {
      const subscriptionType = String(req.body.subscriptionType);
      if (!allowedPlans.has(subscriptionType)) {
        res.status(400).json({ error: "Invalid subscription type" });
        return;
      }
      update.subscriptionType = subscriptionType;
    }

    if (Object.keys(update).length) {
      const result = await User.updateOne({ userId: id }, update);
      if (!result.matchedCount) {
        res.status(404).json({ error: "User not found" });
        return;
      }
    }

    if (typeof req.body?.isAdmin === "boolean") {
      if (req.body.isAdmin) {
        await AdminUser.updateOne(
          { userId: id },
          { $setOnInsert: { userId: id } },
          { upsert: true }
        );
      } else if (id !== req.user.id) {
        await AdminUser.deleteOne({ userId: id });
      }
    }

    res.json({ ok: true });
  }));

  app.delete("/api/admin/users/:id", requireAdmin(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (id === req.user.id) {
      res.status(400).json({ error: "You cannot delete your own admin account" });
      return;
    }

    await Promise.all([
      User.deleteOne({ userId: id }),
      Session.deleteMany({ userId: id }),
      AdminUser.deleteOne({ userId: id }),
      LibraryPlaylist.deleteMany({ userId: id }),
      LikedSong.deleteMany({ userId: id }),
      FollowedArtist.deleteMany({ userId: id }),
      Payment.deleteMany({ userId: id }),
      UserPlaylist.deleteMany({ userId: id }),
      UserPlaylistSong.deleteMany({ userId: id })
    ]);
    res.json({ ok: true });
  }));

  app.get("/api/admin/artists", requireAdmin(async (req, res) => {
    const artists = await Artist.find().sort({ name: 1 }).lean();
    const songCounts = await Song.aggregate([
      { $group: { _id: "$artistId", count: { $sum: 1 } } }
    ]);
    const countMap = new Map(songCounts.map((row) => [row._id, row.count]));
    res.json(artists.map((artist) => ({
      ...toArtistDto(artist),
      songCount: countMap.get(artist.artistId) || 0
    })));
  }));

  app.post("/api/admin/artists", requireAdmin(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const bio = String(req.body?.bio || "").trim();
    const imageUrl = String(req.body?.imageUrl || "/img/music.svg").trim();
    if (!name) {
      res.status(400).json({ error: "Artist name is required" });
      return;
    }

    const existing = await Artist.findOne({ name }).lean();
    if (existing) {
      res.status(409).json({ error: "Artist already exists" });
      return;
    }

    const artistId = await getNextId("artist");
    await Artist.create({ artistId, name, bio, imageUrl });
    res.json({ ok: true, id: artistId });
  }));

  app.patch("/api/admin/artists/:id", requireAdmin(async (req, res) => {
    const id = Number(req.params.id);
    const name = String(req.body?.name || "").trim();
    const bio = String(req.body?.bio || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    if (!Number.isInteger(id) || !name) {
      res.status(400).json({ error: "Invalid artist update" });
      return;
    }

    const update = { name, bio };
    if (imageUrl) update.imageUrl = imageUrl;
    const result = await Artist.updateOne({ artistId: id }, update);
    if (!result.matchedCount) {
      res.status(404).json({ error: "Artist not found" });
      return;
    }
    res.json({ ok: true });
  }));

  app.delete("/api/admin/artists/:id", requireAdmin(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid artist id" });
      return;
    }

    const songCount = await Song.countDocuments({ artistId: id });
    if (songCount > 0) {
      res.status(409).json({ error: "Move or update artist songs before deleting this artist" });
      return;
    }

    await Promise.all([
      Artist.deleteOne({ artistId: id }),
      FollowedArtist.deleteMany({ artistId: id }),
      Album.deleteMany({ artistId: id })
    ]);
    res.json({ ok: true });
  }));

  app.get("/api/admin/albums", requireAdmin(async (req, res) => {
    const albums = await Album.find().sort({ title: 1 }).lean();
    const artistIds = Array.from(new Set(albums.map((album) => album.artistId).filter(Boolean)));
    const artists = artistIds.length
      ? await Artist.find({ artistId: { $in: artistIds } }).lean()
      : [];
    const artistMap = new Map(artists.map((artist) => [artist.artistId, artist]));
    res.json(albums.map((album) => toAlbumDto(album, artistMap)));
  }));

  app.get("/api/admin/playlists", requireAdmin(async (req, res) => {
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

  app.get("/api/admin/playlists/:id/songs", requireAdmin(async (req, res) => {
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
      .select("songId filename trackNumber title artistId albumId genre duration fileUrl")
      .lean();

    const artistIds = Array.from(new Set(songs.map((song) => song.artistId).filter(Boolean)));
    const albumIds = Array.from(new Set(songs.map((song) => song.albumId).filter(Boolean)));
    const [artists, albums] = await Promise.all([
      artistIds.length ? Artist.find({ artistId: { $in: artistIds } }).lean() : [],
      albumIds.length ? Album.find({ albumId: { $in: albumIds } }).lean() : []
    ]);
    const artistMap = new Map(artists.map((artist) => [artist.artistId, artist]));
    const albumMap = new Map(albums.map((album) => [album.albumId, album]));

    const songCoverMap = await loadSongCoverMap(playlist.folder);
    const rows = await Promise.all(
      songs.map(async (row) => ({
        id: row.songId,
        filename: row.filename,
        title: row.title || parseSongMeta(row.filename).title,
        artistId: row.artistId,
        artistName: artistMap.get(row.artistId)?.name || parseSongMeta(row.filename).artist,
        albumId: row.albumId,
        albumTitle: albumMap.get(row.albumId)?.title || "",
        genre: row.genre || "Music",
        duration: row.duration || 0,
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
    requireAdmin(async (req, res) => {
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

      const folderPath = path.join(songsRoot, safeFolder);
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
    requireAdmin(async (req, res) => {
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

  app.delete("/api/admin/playlists/:id", requireAdmin(async (req, res) => {
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
      await UserPlaylistSong.deleteMany({ songId: { $in: songIds } });
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
    requireAdmin(async (req, res) => {
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

      const folderPath = path.join(songsRoot, playlist.folder);
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
        const meta = parseSongMeta(finalAudioName);
        const artist = await getOrCreateArtist(meta.artist);
        const album = await getOrCreateAlbum(
          meta.album === "Single" ? playlist.title : meta.album,
          artist.artistId,
          `/songs/${playlist.folder}/${playlist.cover}`
        );
        await Song.create({
          songId,
          playlistId: id,
          title: meta.title,
          artistId: artist.artistId,
          albumId: album.albumId,
          genre: "Music",
          fileUrl: `/songs/${playlist.folder}/${finalAudioName}`,
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
    requireAdmin(async (req, res) => {
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
      const metadataUpdate = {};
      const title = String(req.body?.title || "").trim();
      const genre = String(req.body?.genre || "").trim();
      const rawArtistId = String(req.body?.artistId || "").trim();
      const rawAlbumId = String(req.body?.albumId || "").trim();
      const rawDuration = String(req.body?.duration || "").trim();
      const artistId = Number(rawArtistId);
      const albumId = Number(rawAlbumId);
      const duration = Number(rawDuration);

      if (title) metadataUpdate.title = title;
      if (genre) metadataUpdate.genre = genre;
      if (rawArtistId && Number.isInteger(artistId)) {
        const artist = await Artist.findOne({ artistId }).lean();
        if (!artist) {
          res.status(400).json({ error: "Artist not found" });
          return;
        }
        metadataUpdate.artistId = artistId;
      }
      if (rawAlbumId && Number.isInteger(albumId)) {
        const album = await Album.findOne({ albumId }).lean();
        if (!album) {
          res.status(400).json({ error: "Album not found" });
          return;
        }
        metadataUpdate.albumId = albumId;
      }
      if (rawDuration && Number.isFinite(duration) && duration >= 0) {
        metadataUpdate.duration = duration;
      }

      if (!coverFile && !audioFile && !Object.keys(metadataUpdate).length) {
        res.status(400).json({ error: "No song changes provided" });
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

      if (Object.keys(metadataUpdate).length) {
        await Song.updateOne({ songId: id }, metadataUpdate);
      }

      res.json({ ok: true });
    })
  );

  app.delete("/api/admin/songs/:id", requireAdmin(async (req, res) => {
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
    await UserPlaylistSong.deleteMany({ songId: id });

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

  app.listen(PORT, HOST, () => {
    const localUrl = HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
    console.log(`Server running on ${PUBLIC_URL || localUrl}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

module.exports = { app, prepareApp };
