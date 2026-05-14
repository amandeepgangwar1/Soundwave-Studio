console.log("Soundwave Studio Running...");

let currentSong = new Audio();
let songs = [];
let currentSongIndex = 0;
let playlistInfo = {};
let playlists = [];
let currentPlaylistId = null;

// Select buttons properly
const playBtn = document.getElementById("play");
const previousBtn = document.getElementById("previous");
const nextBtn = document.getElementById("next");

// Format seconds to mm:ss
function secondsToMinutesSeconds(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

// Fetch playlists
async function fetchPlaylists() {
    try {
        const response = await fetch(`/api/playlists`);
        if (!response.ok) throw new Error("Failed to fetch playlists");
        playlists = await response.json();
        return playlists;
    } catch (error) {
        console.error("Error fetching playlists:", error);
        return [];
    }
}

// Fetch playlist details (songs list and metadata)
async function fetchPlaylistDetails(playlistId) {
    try {
        const response = await fetch(`/api/playlists/${playlistId}`);
        if (!response.ok) throw new Error("Failed to fetch playlist");
        playlistInfo = await response.json();
        songs = playlistInfo.songs || [];
        return true;
    } catch (error) {
        console.error("Error fetching playlist:", error);
        return false;
    }
}

// Switch to different playlist
async function switchPlaylist(playlistId) {
    currentPlaylistId = playlistId;
    const loaded = await fetchPlaylistDetails(playlistId);
    if (loaded) {
        currentSongIndex = 0;
        loadSongs();
        if (songs.length > 0) {
            playMusic(songs[0]);
        }
    }
}

// DEFINE SONGS
function loadSongs() {
    const songUL = document.querySelector(".songList ul");
    songUL.innerHTML = "";

    // Use fragment for better performance with large lists
    const fragment = document.createDocumentFragment();
    
    songs.forEach((song, index) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <img class="invert" src="img/music.svg" alt="">
            <div class="info">
                <div>${song}</div>
                <div>${playlistInfo.title || "Music"}</div>
            </div>
            <div class="playnow">
                <span>Play Now</span>
                <img class="invert" src="img/play.svg" alt="">
            </div>`;
        
        li.addEventListener("click", () => {
            currentSongIndex = index;
            playMusic(songs[index]);
        });
        
        fragment.appendChild(li);
    });
    
    songUL.appendChild(fragment);
}

// Play Music
function playMusic(track, pause = false) {
    try {
        // Use the folder from playlistInfo
        const songFolder = playlistInfo.folder;
        if (!songFolder) return;
        const fullPath = `/songs/${songFolder}/${track}`;
        
        currentSong.src = fullPath;
        
        document.querySelector(".songinfo").innerHTML = track;
        document.querySelector(".songtime").innerHTML = "00:00 / 00:00";

        if (!pause) {
            currentSong.play().catch((error) => {
                console.error("Error playing song:", error);
            });
            playBtn.src = "img/pause.svg";
        }
    } catch (error) {
        console.error("Error in playMusic:", error);
    }
}

// Load Playlists/Cards
function loadPlaylists() {
    const cardContainer = document.querySelector(".cardContainer");
    cardContainer.innerHTML = "";

    const fragment = document.createDocumentFragment();
    
    playlists.forEach((playlist) => {
        const card = document.createElement("div");
        card.className = "card";
        card.style.cursor = "pointer";
        card.innerHTML = `
            <img src="${playlist.coverUrl}" alt="${playlist.title}" style="height: 150px; width: 100%; object-fit: cover;">
            <div style="padding-top: 10px; font-weight: bold;">${playlist.title}</div>
            <div style="font-size: 12px; color: #888;">${playlist.description}</div>
            <div class="play">
                <img src="img/play.svg" alt="">
            </div>`;
        
        card.addEventListener("click", () => {
            switchPlaylist(playlist.id);
        });
        
        fragment.appendChild(card);
    });
    
    cardContainer.appendChild(fragment);
}

// MAIN FUNCTION
async function main() {

    // Load Playlists from API
    await fetchPlaylists();
    if (playlists.length === 0) {
        console.error("No playlists found");
        return;
    }

    loadPlaylists();

    // Load first playlist
    await switchPlaylist(playlists[0].id);
    if (songs.length > 0) {
        playMusic(songs[0], true);
    }

    // Play / Pause
    playBtn.addEventListener("click", () => {
        if (currentSong.paused) {
            currentSong.play();
            playBtn.src = "img/pause.svg";
        } else {
            currentSong.pause();
            playBtn.src = "img/play.svg";
        }
    });

    // Time Update
    currentSong.addEventListener("timeupdate", () => {
        document.querySelector(".songtime").innerHTML =
            `${secondsToMinutesSeconds(currentSong.currentTime)} / ${secondsToMinutesSeconds(currentSong.duration)}`;

        if (currentSong.duration > 0) {
            document.querySelector(".circle").style.left =
                (currentSong.currentTime / currentSong.duration) * 100 + "%";
        }
    });

    // Song ended - play next
    currentSong.addEventListener("ended", () => {
        if (currentSongIndex < songs.length - 1) {
            currentSongIndex++;
            playMusic(songs[currentSongIndex]);
        } else {
            // Loop back to first song
            currentSongIndex = 0;
            playMusic(songs[currentSongIndex]);
        }
    });

    // Seekbar
    document.querySelector(".seekbar").addEventListener("click", e => {
        const percent = (e.offsetX / e.target.getBoundingClientRect().width) * 100;
        currentSong.currentTime = (currentSong.duration * percent) / 100;
    });

    // Previous
    previousBtn.addEventListener("click", () => {
        if (currentSongIndex > 0) {
            currentSongIndex--;
            playMusic(songs[currentSongIndex]);
        } else {
            // Loop to last song
            currentSongIndex = songs.length - 1;
            playMusic(songs[currentSongIndex]);
        }
    });

    // Next
    nextBtn.addEventListener("click", () => {
        if (currentSongIndex < songs.length - 1) {
            currentSongIndex++;
            playMusic(songs[currentSongIndex]);
        } else {
            // Loop to first song
            currentSongIndex = 0;
            playMusic(songs[currentSongIndex]);
        }
    });

    // Volume Control
    document.querySelector(".range input").addEventListener("input", e => {
        currentSong.volume = e.target.value / 100;
    });

    // Mute Toggle
    const volumeIcon = document.querySelector(".volume img");

    volumeIcon.addEventListener("click", () => {
        if (currentSong.volume > 0) {
            currentSong.volume = 0;
            volumeIcon.src = "img/mute.svg";
            document.querySelector(".range input").value = 0;
        } else {
            currentSong.volume = 0.5;
            volumeIcon.src = "img/volume.svg";
            document.querySelector(".range input").value = 50;
        }
    });

    // Hamburger Menu
    document.querySelector(".hamburger").addEventListener("click", () => {
        document.querySelector(".left").style.left = "0";
    });

    document.querySelector(".close").addEventListener("click", () => {
        document.querySelector(".left").style.left = "-120%";
    });
}

main();
