const path = require("path");
const fs = require("fs/promises");
const mongoose = require("mongoose");
const { artistProfiles } = require("./catalog-data");

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
        fileUrl: `/songs/${folder}/${filename}`,
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
