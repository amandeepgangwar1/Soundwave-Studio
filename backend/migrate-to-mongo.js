const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { connectDb, models } = require("./db");

const {
  User,
  Session,
  Playlist,
  Song,
  LibraryPlaylist,
  LikedSong,
  AdminUser,
  AdminRequest,
  Counter
} = models;

async function resetCollections() {
  await Promise.all([
    User.deleteMany({}),
    Session.deleteMany({}),
    Playlist.deleteMany({}),
    Song.deleteMany({}),
    LibraryPlaylist.deleteMany({}),
    LikedSong.deleteMany({}),
    AdminUser.deleteMany({}),
    AdminRequest.deleteMany({}),
    Counter.deleteMany({})
  ]);
}

async function migrate() {
  const sqlitePath = path.join(__dirname, "data", "app.db");
  const sqliteDb = await open({ filename: sqlitePath, driver: sqlite3.Database });

  await connectDb();
  await resetCollections();

  const users = await sqliteDb.all(
    "SELECT id, name, email, password_hash, created_at FROM users"
  );
  if (users.length) {
    await User.insertMany(
      users.map((u) => ({
        userId: u.id,
        name: u.name,
        email: u.email,
        passwordHash: u.password_hash,
        createdAt: new Date(u.created_at)
      }))
    );
  }

  const sessions = await sqliteDb.all(
    "SELECT user_id, token, created_at, expires_at FROM sessions"
  );
  if (sessions.length) {
    await Session.insertMany(
      sessions.map((s) => ({
        userId: s.user_id,
        token: s.token,
        createdAt: new Date(s.created_at),
        expiresAt: new Date(s.expires_at)
      }))
    );
  }

  const playlists = await sqliteDb.all(
    "SELECT id, title, description, folder, cover FROM playlists"
  );
  if (playlists.length) {
    await Playlist.insertMany(
      playlists.map((p) => ({
        playlistId: p.id,
        title: p.title,
        description: p.description,
        folder: p.folder,
        cover: p.cover
      }))
    );
  }

  const songs = await sqliteDb.all(
    "SELECT id, playlist_id, filename, track_number FROM songs"
  );
  if (songs.length) {
    await Song.insertMany(
      songs.map((s) => ({
        songId: s.id,
        playlistId: s.playlist_id,
        filename: s.filename,
        trackNumber: s.track_number
      }))
    );
  }

  const libraryPlaylists = await sqliteDb.all(
    "SELECT user_id, playlist_id, created_at FROM library_playlists"
  );
  if (libraryPlaylists.length) {
    await LibraryPlaylist.insertMany(
      libraryPlaylists.map((lp) => ({
        userId: lp.user_id,
        playlistId: lp.playlist_id,
        createdAt: new Date(lp.created_at)
      }))
    );
  }

  const likedSongs = await sqliteDb.all(
    "SELECT user_id, song_id, created_at FROM liked_songs"
  );
  if (likedSongs.length) {
    await LikedSong.insertMany(
      likedSongs.map((ls) => ({
        userId: ls.user_id,
        songId: ls.song_id,
        createdAt: new Date(ls.created_at)
      }))
    );
  }

  const adminUsers = await sqliteDb.all("SELECT user_id FROM admin_users");
  if (adminUsers.length) {
    await AdminUser.insertMany(
      adminUsers.map((au) => ({
        userId: au.user_id
      }))
    );
  }

  const adminRequests = await sqliteDb.all(
    "SELECT user_id, created_at FROM admin_requests"
  );
  if (adminRequests.length) {
    await AdminRequest.insertMany(
      adminRequests.map((ar) => ({
        userId: ar.user_id,
        createdAt: new Date(ar.created_at)
      }))
    );
  }

  const maxUserId = users.reduce((max, u) => Math.max(max, u.id), 0);
  const maxPlaylistId = playlists.reduce((max, p) => Math.max(max, p.id), 0);
  const maxSongId = songs.reduce((max, s) => Math.max(max, s.id), 0);

  await Counter.insertMany([
    { _id: "user", seq: maxUserId },
    { _id: "playlist", seq: maxPlaylistId },
    { _id: "song", seq: maxSongId }
  ]);

  await sqliteDb.close();
  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
