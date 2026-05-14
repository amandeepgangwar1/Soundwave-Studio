const mongoose = require("mongoose");
const { connectDb, getNextId, models } = require("./db");
const {
  artistProfiles,
  getArtistProfile,
  getSongMetadataOverride
} = require("./catalog-data");

const {
  Artist,
  Album,
  Song,
  Playlist,
  FollowedArtist
} = models;

const catalogNames = new Set(
  artistProfiles.map((artist) => artist.name.toLowerCase())
);

const generatedArtistPatterns = [
  /songs\.pk/i,
  /studentoftheyear/i,
  /djjohal/i,
  /baaghi/i,
  /gully boy/i,
  /judwaa/i,
  /kalank/i,
  /heropanti/i,
  /raabta/i,
  /zorawar/i,
  /vickydonor/i,
  /gogoagone/i,
  /ekthidaayan/i,
  /makkhi/i,
  /blockbuster/i,
  /full song/i,
  /video song/i,
  /official/i,
  /exclusive/i,
  /mp3/i,
  /copy/i,
  /\d/
];

async function upsertArtist(profile) {
  const existing = await Artist.findOne({ name: profile.name }).lean();
  if (existing) {
    await Artist.updateOne(
      { artistId: existing.artistId },
      { bio: profile.bio, imageUrl: profile.imageUrl }
    );
    return { ...existing, ...profile };
  }

  const artistId = await getNextId("artist");
  const created = await Artist.create({ artistId, ...profile });
  return created.toObject();
}

async function getOrCreateProfileArtist(name) {
  const profile = getArtistProfile(name) || {
    name,
    bio: `${name} on Soundwave Studio.`,
    imageUrl: "/img/music.svg"
  };
  return upsertArtist(profile);
}

async function getOrCreateAlbum(title, artistId, coverImage) {
  const existing = await Album.findOne({ title, artistId }).lean();
  if (existing) {
    if (coverImage && !existing.coverImage) {
      await Album.updateOne({ albumId: existing.albumId }, { coverImage });
      return { ...existing, coverImage };
    }
    return existing;
  }

  const albumId = await getNextId("album");
  const created = await Album.create({ albumId, title, artistId, coverImage });
  return created.toObject();
}

function isGeneratedArtist(row) {
  const name = String(row.name || "");
  if (catalogNames.has(name.toLowerCase())) return false;
  if (row.imageUrl && row.imageUrl !== "/img/music.svg") return false;
  return generatedArtistPatterns.some((pattern) => pattern.test(name));
}

async function main() {
  await connectDb();

  let seededArtists = 0;
  for (const profile of artistProfiles) {
    await upsertArtist(profile);
    seededArtists += 1;
  }

  const playlists = await Playlist.find()
    .select("playlistId title folder cover")
    .lean();
  const playlistMap = new Map(
    playlists.map((playlist) => [playlist.playlistId, playlist])
  );
  const songs = await Song.find()
    .select("songId playlistId filename title artistId albumId genre fileUrl")
    .lean();

  let updatedSongs = 0;
  for (const song of songs) {
    const meta = getSongMetadataOverride(song.filename);
    if (!meta) continue;

    const playlist = playlistMap.get(song.playlistId);
    const artist = await getOrCreateProfileArtist(meta.artist);
    const albumTitle = meta.album === "Single" && playlist ? playlist.title : meta.album;
    const coverImage = playlist ? `/songs/${playlist.folder}/${playlist.cover}` : "";
    const album = await getOrCreateAlbum(albumTitle || "Single", artist.artistId, coverImage);
    const fileUrl = playlist ? `/songs/${playlist.folder}/${song.filename}` : song.fileUrl;

    const update = {
      title: meta.title,
      artistId: artist.artistId,
      albumId: album.albumId,
      genre: song.genre || "Music",
      fileUrl
    };

    const changed = Object.entries(update).some(([key, value]) => song[key] !== value);
    if (!changed) continue;

    await Song.updateOne({ songId: song.songId }, update);
    updatedSongs += 1;
  }

  const songCounts = await Song.aggregate([
    { $group: { _id: "$artistId", count: { $sum: 1 } } }
  ]);
  const countMap = new Map(songCounts.map((row) => [row._id, row.count]));
  const artists = await Artist.find().select("artistId name imageUrl").lean();

  let removedArtists = 0;
  for (const artist of artists) {
    if ((countMap.get(artist.artistId) || 0) > 0) continue;
    if (!isGeneratedArtist(artist)) continue;

    await Promise.all([
      Artist.deleteOne({ artistId: artist.artistId }),
      FollowedArtist.deleteMany({ artistId: artist.artistId }),
      Album.deleteMany({ artistId: artist.artistId })
    ]);
    removedArtists += 1;
  }

  console.log(
    `Artist metadata fixed: ${seededArtists} profiles synced, ${updatedSongs} songs updated, ${removedArtists} generated artists removed.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
