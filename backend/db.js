const path = require("path");
const fs = require("fs/promises");
const mongoose = require("mongoose");
require("./env");
const { artistProfiles } = require("./catalog-data");

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/soundwave";
const songsRoot = path.join(__dirname, "..", "frontend", "songs");
const supportedAudioExtensions = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".flac",
  ".m4a",
  ".aac",
  ".webm"
]);

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, default: "" },
  authProvider: { type: String, default: "email" },
  subscriptionType: { type: String, default: "free" },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

const playlistSchema = new mongoose.Schema({
  playlistId: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  folder: { type: String, required: true },
  cover: { type: String, required: true }
});

const artistSchema = new mongoose.Schema({
  artistId: { type: Number, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  bio: { type: String, default: "" },
  imageUrl: { type: String, default: "/img/music.svg" },
  createdAt: { type: Date, default: Date.now }
});

const albumSchema = new mongoose.Schema({
  albumId: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  artistId: { type: Number, default: null },
  releaseDate: { type: Date, default: null },
  coverImage: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const songSchema = new mongoose.Schema({
  songId: { type: Number, required: true, unique: true },
  playlistId: { type: Number, required: true },
  title: { type: String, default: "" },
  artistId: { type: Number, default: null },
  albumId: { type: Number, default: null },
  genre: { type: String, default: "Music" },
  duration: { type: Number, default: 0 },
  fileUrl: { type: String, default: "" },
  filename: { type: String, required: true },
  trackNumber: { type: Number, required: true },
  embedding: { type: [Number], default: undefined },
  embeddingModel: { type: String, default: "" },
  embeddingDimensions: { type: Number, default: 0 },
  embeddingText: { type: String, default: "" },
  embeddingUpdatedAt: { type: Date, default: null }
});

const libraryPlaylistSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  playlistId: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
libraryPlaylistSchema.index({ userId: 1, playlistId: 1 }, { unique: true });

const likedSongSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  songId: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
likedSongSchema.index({ userId: 1, songId: 1 }, { unique: true });

const followedArtistSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  artistId: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
followedArtistSchema.index({ userId: 1, artistId: 1 }, { unique: true });

const userPlaylistSchema = new mongoose.Schema({
  userPlaylistId: { type: Number, required: true, unique: true },
  userId: { type: Number, required: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  isShared: { type: Boolean, default: false },
  shareToken: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const userPlaylistSongSchema = new mongoose.Schema({
  userPlaylistId: { type: Number, required: true },
  userId: { type: Number, required: true },
  songId: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
userPlaylistSongSchema.index(
  { userPlaylistId: 1, songId: 1 },
  { unique: true }
);

const paymentSchema = new mongoose.Schema({
  paymentId: { type: Number, required: true, unique: true },
  userId: { type: Number, required: true },
  plan: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  method: { type: String, required: true },
  gateway: { type: String, default: "razorpay" },
  gatewayOrderId: { type: String, default: "" },
  gatewayPaymentId: { type: String, default: "" },
  gatewaySignature: { type: String, default: "" },
  paymentStatus: { type: String, default: "created" },
  paymentDate: { type: Date, default: Date.now }
});

const adminUserSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const adminRequestSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const Counter = mongoose.model("Counter", counterSchema);
const User = mongoose.model("User", userSchema);
const Session = mongoose.model("Session", sessionSchema);
const Playlist = mongoose.model("Playlist", playlistSchema);
const Artist = mongoose.model("Artist", artistSchema);
const Album = mongoose.model("Album", albumSchema);
const Song = mongoose.model("Song", songSchema);
const LibraryPlaylist = mongoose.model("LibraryPlaylist", libraryPlaylistSchema);
const LikedSong = mongoose.model("LikedSong", likedSongSchema);
const FollowedArtist = mongoose.model("FollowedArtist", followedArtistSchema);
const UserPlaylist = mongoose.model("UserPlaylist", userPlaylistSchema);
const UserPlaylistSong = mongoose.model("UserPlaylistSong", userPlaylistSongSchema);
const Payment = mongoose.model("Payment", paymentSchema);
const AdminUser = mongoose.model("AdminUser", adminUserSchema);
const AdminRequest = mongoose.model("AdminRequest", adminRequestSchema);

async function connectDb() {
  await mongoose.connect(MONGO_URI);
}

async function getNextId(name) {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true }
  );
  return doc.seq;
}

function hasPlayableAudioSignature(buffer) {
  if (!buffer || buffer.length < 4) return false;

  const startsWith = (value) => buffer.subarray(0, value.length).equals(Buffer.from(value));
  const hasAt = (offset, value) => buffer.subarray(offset, offset + value.length).equals(Buffer.from(value));

  return (
    startsWith("ID3") ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) ||
    (startsWith("RIFF") && hasAt(8, "WAVE")) ||
    startsWith("OggS") ||
    startsWith("fLaC") ||
    hasAt(4, "ftyp") ||
    (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3)
  );
}

async function isPlayableAudioFile(target) {
  let handle;
  try {
    handle = await fs.open(target, "r");
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return hasPlayableAudioSignature(buffer.subarray(0, bytesRead));
  } catch (err) {
    return false;
  } finally {
    if (handle) await handle.close();
  }
}

function isAudioFilename(filename) {
  return supportedAudioExtensions.has(path.extname(filename).toLowerCase());
}

async function readPlaylistInfo(folderName) {
  const infoPath = path.join(songsRoot, folderName, "info.json");
  try {
    const raw = await fs.readFile(infoPath, "utf8");
    const info = JSON.parse(raw);
    return {
      hasInfo: true,
      info: info && typeof info === "object" ? info : {}
    };
  } catch (err) {
    return { hasInfo: false, info: {} };
  }
}

async function listPlayableSongs(folderPath, infoSongs = []) {
  const candidates = [];
  const seen = new Set();

  function addCandidate(filename) {
    const safeName = path.basename(String(filename || ""));
    if (!safeName || !isAudioFilename(safeName) || seen.has(safeName)) return;
    seen.add(safeName);
    candidates.push(safeName);
  }

  infoSongs.forEach(addCandidate);

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) addCandidate(entry.name);
    }
  } catch (err) {
    return [];
  }

  const playable = [];
  for (const filename of candidates) {
    const target = path.join(folderPath, filename);
    try {
      const stats = await fs.stat(target);
      if (stats.isFile() && await isPlayableAudioFile(target)) {
        playable.push(filename);
      }
    } catch (err) {
      // Skip files listed in info.json that are no longer present.
    }
  }
  return playable;
}

async function syncCatalogFromFiles() {
  let entries = [];
  try {
    entries = await fs.readdir(songsRoot, { withFileTypes: true });
  } catch (err) {
    console.error("Songs folder not found:", err.message);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderPath = path.join(songsRoot, entry.name);
    const { hasInfo, info } = await readPlaylistInfo(entry.name);
    const infoSongs = Array.isArray(info.songs) ? info.songs : [];
    const songs = await listPlayableSongs(folderPath, infoSongs);
    if (!hasInfo && songs.length === 0) continue;

    const title = info.title || entry.name.replace(/_/g, " ");
    const description = info.description || "Playlist";
    const folder = info.folder || entry.name;
    const cover = info.cover || "cover.jpg";

    let playlist = await Playlist.findOne({ folder }).lean();
    if (!playlist && folder !== entry.name) {
      playlist = await Playlist.findOne({ folder: entry.name }).lean();
    }
    if (!playlist && hasInfo) {
      playlist = await Playlist.findOne({ title }).lean();
    }

    if (!playlist) {
      const playlistId = await getNextId("playlist");
      const created = await Playlist.create({
        playlistId,
        title,
        description,
        folder,
        cover
      });
      playlist = created.toObject();
    }

    if (songs.length === 0) continue;

    const existingSongs = await Song.find({ playlistId: playlist.playlistId })
      .select("filename trackNumber")
      .lean();
    const existingFilenames = new Set(existingSongs.map((song) => song.filename));
    let nextTrack = existingSongs.reduce(
      (max, song) => Math.max(max, Number(song.trackNumber || 0)),
      0
    ) + 1;

    for (const filename of songs) {
      if (existingFilenames.has(filename)) continue;

      const songId = await getNextId("song");
      await Song.create({
        songId,
        playlistId: playlist.playlistId,
        fileUrl: `/songs/${playlist.folder}/${filename}`,
        filename,
        trackNumber: nextTrack
      });
      existingFilenames.add(filename);
      nextTrack += 1;
    }
  }
}

async function seedFeaturedArtists() {
  for (const artist of artistProfiles) {
    const existing = await Artist.findOne({ name: artist.name });
    if (existing) {
      const update = {};
      if (!existing.bio) update.bio = artist.bio;
      if (!existing.imageUrl || existing.imageUrl === "/img/music.svg") {
        update.imageUrl = artist.imageUrl;
      }
      if (Object.keys(update).length) {
        await Artist.updateOne({ artistId: existing.artistId }, update);
      }
      continue;
    }

    const artistId = await getNextId("artist");
    await Artist.create({ artistId, ...artist });
  }
}

async function seedIfEmpty() {
  await seedFeaturedArtists();
  await syncCatalogFromFiles();
}

module.exports = {
  connectDb,
  seedIfEmpty,
  getNextId,
  models: {
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
    AdminUser,
    AdminRequest,
    Counter
  }
};
