const path = require("path");

function commonsImage(fileName) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=480`;
}

const artistProfiles = [
  {
    name: "A. R. Rahman",
    bio: "Composer, singer, and music producer.",
    imageUrl: commonsImage("A R Rahman snapped at the special screening of Amar Singh Chamkila.jpg")
  },
  {
    name: "Aastha Gill",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Aastha Gill snapped promoting their song (cropped).jpg")
  },
  {
    name: "Akriti Kakar",
    bio: "Indian singer.",
    imageUrl: commonsImage("Akriti Kakkar Radio One Karaoke sessions.jpg")
  },
  {
    name: "Amaal Mallik",
    bio: "Indian music composer, singer, and lyricist.",
    imageUrl: commonsImage("Amaal Mallik at the pink carpet of Bollywood Hungama OTT India Fest 2023 award ceremony.jpg")
  },
  {
    name: "Anu Malik",
    bio: "Indian music director and singer.",
    imageUrl: commonsImage("Anu Malik.jpg")
  },
  {
    name: "Anuradha Paudwal",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Anuradha Paudwal 57th Idea Filmfare Awards 2011.jpg")
  },
  {
    name: "Arijit Singh",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Arijit 5th GiMA Awards.jpg")
  },
  {
    name: "Arjun Kanungo",
    bio: "Indian singer and composer.",
    imageUrl: commonsImage("Arjun Kanungo at Forum Vijaya.jpg")
  },
  {
    name: "Armaan Malik",
    bio: "Indian singer-songwriter.",
    imageUrl: commonsImage("Armaan Malik 2016.jpg")
  },
  {
    name: "Asees Kaur",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Asees Kaur at the 66th Filmfare Awards (cropped).jpg")
  },
  {
    name: "Atif Aslam",
    bio: "Pakistani playback singer and songwriter.",
    imageUrl: commonsImage("Atif Aslam in black coat.jpg")
  },
  {
    name: "Ayushmann Khurrana",
    bio: "Indian actor and singer.",
    imageUrl: commonsImage("Ayushmann Khurrana promotos 'Anek' in Delhi (1) (cropped).jpg")
  },
  {
    name: "Badshah",
    bio: "Indian rapper, singer, and music producer.",
    imageUrl: commonsImage("Badshah spotted before the shoot of No Filter Neha.jpg")
  },
  {
    name: "Bappi Lahiri",
    bio: "Indian music director and singer.",
    imageUrl: commonsImage("Bappi Lahiri 2016.jpg")
  },
  {
    name: "Benny Dayal",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Benny+dayal singer.jpg")
  },
  {
    name: "Darshan Raval",
    bio: "Indian singer and composer.",
    imageUrl: commonsImage("Darshan Raval in 2019.jpg")
  },
  {
    name: "DIVINE",
    bio: "Indian rapper.",
    imageUrl: commonsImage("Divine (cropped).jpg")
  },
  {
    name: "Divya Kumar",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Divya Kumar Singer.jpg")
  },
  {
    name: "Harrdy Sandhu",
    bio: "Indian singer and actor.",
    imageUrl: commonsImage("Harrdy Sandhu.jpg")
  },
  {
    name: "Jonita Gandhi",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Jonita Gandhi performs at Aurora, IIIT Gwalior (2018).jpg")
  },
  {
    name: "KK",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("KK (125).jpg")
  },
  {
    name: "Mamta Sharma",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Mamta sharma shabbir's wedding (cropped).jpg")
  },
  {
    name: "Meet Bros",
    bio: "Indian music director duo.",
    imageUrl: commonsImage("Meet Bros at Zanjeer screening.jpg")
  },
  {
    name: "Monali Thakur",
    bio: "Indian playback singer and actress.",
    imageUrl: commonsImage("Monali Thakur grace the launch party of luxury audio brand 'Harman Kardon' (cropped).jpg")
  },
  {
    name: "Nakash Aziz",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Nakash Aziz.jpg")
  },
  {
    name: "Navraj Hans",
    bio: "Indian singer and actor.",
    imageUrl: commonsImage("Navraj hans.jpg")
  },
  {
    name: "Neeti Mohan",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Neeti Mohan, Dadasaheb Phalke Film Foundation Awards 2018 (13) (cropped).jpg")
  },
  {
    name: "Neha Kakkar",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Neha Kakkar in January 2020.jpg")
  },
  {
    name: "Pritam",
    bio: "Indian music director and composer.",
    imageUrl: commonsImage("Pritam Chakraborty at the 5th GiMA Awards.jpg")
  },
  {
    name: "Raftaar",
    bio: "Indian rapper, lyricist, and music producer.",
    imageUrl: commonsImage("Raftaar snapped on the sets of Dance India Dance (cropped).jpg")
  },
  {
    name: "Ranveer Singh",
    bio: "Indian actor and rapper.",
    imageUrl: commonsImage("Ranveer Singh in 2023 (1) (cropped).jpg")
  },
  {
    name: "Shahid Mallya",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Shahid Mallya.jpg")
  },
  {
    name: "Shreya Ghoshal",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Shreya Ghoshal Behindwoods Gold Icons Awards 2023 (Cropped).jpg")
  },
  {
    name: "Sonu Nigam",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Sonu Nigam121.jpg")
  },
  {
    name: "Sunidhi Chauhan",
    bio: "Indian playback singer.",
    imageUrl: commonsImage("Sunidhi Chauhan.jpg")
  },
  {
    name: "Vishal Dadlani",
    bio: "Indian singer, songwriter, and music composer.",
    imageUrl: commonsImage("Vishal Dadlani Indian Idol Junior launch (cropped).jpg")
  },
  {
    name: "Yo Yo Honey Singh",
    bio: "Indian singer, rapper, and music producer.",
    imageUrl: commonsImage("Yo Yo Honey Singh.jpg")
  }
];

const artistProfileMap = new Map(
  artistProfiles.map((artist) => [artist.name.toLowerCase(), artist])
);

const songMetadataRules = [
  ["bol do na zara", "Bol Do Na Zara", "Armaan Malik"],
  ["chitta ve", "Chitta Ve", "Shahid Mallya"],
  ["kar gayi chull", "Kar Gayi Chull", "Badshah"],
  ["kuch to hai", "Kuch To Hai", "Armaan Malik"],
  ["pyaar ki", "Pyaar Ki", "Nakash Aziz"],
  ["sab tera", "Sab Tera", "Armaan Malik"],
  ["aanar kali", "Anarkali Disco Chali", "Mamta Sharma"],
  ["ae gori", "Ae Gori Downloading Karaila", "Mamta Sharma"],
  ["yaaram", "Yaaram", "Sunidhi Chauhan"],
  ["khoonchoosle", "Khoon Choos Le", "Arjun Kanungo"],
  ["areareare", "Are Are Are", "KK"],
  ["radha", "Radha", "Shreya Ghoshal"],
  ["ishqwalalove", "Ishq Wala Love", "Neeti Mohan"],
  ["thediscosong", "The Disco Song", "Benny Dayal"],
  ["kukkad", "Kukkad", "Shahid Mallya"],
  ["vele", "Vele", "Vishal Dadlani"],
  ["panidarangmale", "Pani Da Rang", "Ayushmann Khurrana"],
  ["aadat se majboor", "Aadat Se Majboor", "Benny Dayal"],
  ["apna time aayega", "Apna Time Aayega", "Ranveer Singh"],
  ["badri ki dulhania", "Badri Ki Dulhania", "Neha Kakkar"],
  ["saturday saturday", "Saturday Saturday", "Badshah"],
  ["bezubaan phir se", "Bezubaan Phir Se", "Vishal Dadlani"],
  ["blue eyes", "Blue Eyes", "Yo Yo Honey Singh"],
  ["brown rang", "Brown Rang", "Yo Yo Honey Singh"],
  ["chaar botal vodka", "Chaar Botal Vodka", "Yo Yo Honey Singh"],
  ["chhote chhote peg", "Chhote Chhote Peg", "Yo Yo Honey Singh"],
  ["chogada", "Chogada", "Darshan Raval"],
  ["dheere dheere se meri zindagi", "Dheere Dheere Se Meri Zindagi", "Yo Yo Honey Singh"],
  ["love dose", "Love Dose", "Yo Yo Honey Singh"],
  ["aa toh sahii", "Aa Toh Sahii", "Neha Kakkar"],
  ["get ready to fight again", "Get Ready To Fight Again", "Vishal Dadlani"],
  ["girl i need you", "Girl I Need You", "Arijit Singh"],
  ["hornn blow", "Hornn Blow", "Harrdy Sandhu"],
  ["raat bhar", "Raat Bhar", "Arijit Singh"],
  ["the pappi song", "The Pappi Song", "Raftaar"],
  ["first class", "First Class", "Arijit Singh"],
  ["talk about love", "Let's Talk About Love", "Raftaar"],
  ["lift teri bandh hai", "Lift Teri Bandh Hai", "Anu Malik"],
  ["main tera boyfriend", "Main Tera Boyfriend", "Arijit Singh"],
  ["issey kehte hain hip hop", "Issey Kehte Hain Hip Hop", "Yo Yo Honey Singh"],
  ["palat tera hero idhar hai", "Palat Tera Hero Idhar Hai", "Arijit Singh"],
  ["ready to move", "Ready To Move", "Armaan Malik"],
  ["sau tarah ke", "Sau Tarah Ke", "Jonita Gandhi"],
  ["superman", "Superman", "Yo Yo Honey Singh"],
  ["tamma tamma again", "Tamma Tamma Again", "Badshah"],
  ["abhi toh party shuru hui hai", "Abhi Toh Party Shuru Hui Hai", "Badshah"]
];

function normalizeSongLookup(filename) {
  return path
    .parse(filename)
    .name
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/songs\.pk/g, " ")
    .replace(/djjohal\.com/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSongLookup(filename) {
  return normalizeSongLookup(filename).replace(/\s+/g, "");
}

function getArtistProfile(name) {
  return artistProfileMap.get(String(name || "").toLowerCase()) || null;
}

function getSongMetadataOverride(filename) {
  const normalized = normalizeSongLookup(filename);
  const compact = compactSongLookup(filename);
  const match = songMetadataRules.find(([needle]) => {
    const normalizedNeedle = normalizeSongLookup(needle);
    const compactNeedle = normalizedNeedle.replace(/\s+/g, "");
    return normalized.includes(normalizedNeedle) || compact.includes(compactNeedle);
  });
  if (!match) return null;

  return {
    title: match[1],
    artist: match[2],
    album: "Single"
  };
}

module.exports = {
  artistProfiles,
  commonsImage,
  getArtistProfile,
  getSongMetadataOverride
};
