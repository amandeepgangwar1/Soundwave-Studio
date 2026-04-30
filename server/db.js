const path = require("path");
const fs = require("fs/promises");
const mongoose = require("mongoose");

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/soundwave";
const songsRoot = path.join(__dirname, "..", "songs");

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
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

const songSchema = new mongoose.Schema({
  songId: { type: Number, required: true, unique: true },
  playlistId: { type: Number, required: true },
  filename: { type: String, required: true },
  trackNumber: { type: Number, required: true }
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
const Song = mongoose.model("Song", songSchema);
const LibraryPlaylist = mongoose.model("LibraryPlaylist", libraryPlaylistSchema);
const LikedSong = mongoose.model("LikedSong", likedSongSchema);
const AdminUser = mongoose.model("AdminUser", adminUserSchema);
const AdminRequest = mongoose.model("AdminRequest", adminRequestSchema);

async function connectDb() {
  await mongoose.connect(MONGO_URI);
}

async function getNextId(name) {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

async function seedIfEmpty() {
  const count = await Playlist.countDocuments();
  if (count > 0) return;

  let entries = [];
  try {
    entries = await fs.readdir(songsRoot, { withFileTypes: true });
  } catch (err) {
    console.error("Songs folder not found:", err.message);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const infoPath = path.join(songsRoot, entry.name, "info.json");
    let info;
    try {
      const raw = await fs.readFile(infoPath, "utf8");
      info = JSON.parse(raw);
    } catch (err) {
      continue;
    }

    const title = info.title || entry.name;
    const description = info.description || "Playlist";
    const folder = info.folder || entry.name;
    const cover = info.cover || "cover.jpg";
    const songs = Array.isArray(info.songs) ? info.songs : [];

    const playlistId = await getNextId("playlist");
    await Playlist.create({
      playlistId,
      title,
      description,
      folder,
      cover
    });

    let track = 1;
    for (const filename of songs) {
      const songId = await getNextId("song");
      await Song.create({
        songId,
        playlistId,
        filename,
        trackNumber: track
      });
      track += 1;
    }
  }
}

module.exports = {
  connectDb,
  seedIfEmpty,
  getNextId,
  models: {
    User,
    Session,
    Playlist,
    Song,
    LibraryPlaylist,
    LikedSong,
    AdminUser,
    AdminRequest,
    Counter
  }
};
