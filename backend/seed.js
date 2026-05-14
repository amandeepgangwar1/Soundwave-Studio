const { connectDb, seedIfEmpty, models } = require("./db");

const { Playlist, Song, Counter } = models;

async function run() {
  await connectDb();
  await Playlist.deleteMany({});
  await Song.deleteMany({});
  await Counter.deleteMany({ _id: { $in: ["playlist", "song"] } });
  await seedIfEmpty();
  console.log("Database seeded.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
