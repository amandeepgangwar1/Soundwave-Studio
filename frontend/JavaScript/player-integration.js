/**
 * Player Integration - Connect waveform visualizer with the main player
 * Integrates D3 waveform, color themes, and immersive theater mode
 */

let integrationInitialized = false;

function getJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

window.addEventListener("soundwave:player-ready", () => {
  initializeWaveformIntegration();
});

function initializeExistingAudioElement() {
  if (getAudioElement()) {
    initializeWaveformIntegration();
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initializeExistingAudioElement, { once: true });
} else {
  initializeExistingAudioElement();
}

function getPlayerState() {
  return window.soundwavePlayer || null;
}

function getAudioElement() {
  const playerState = getPlayerState();
  return playerState?.audio || playerState?.getAudioElement?.() || document.querySelector("audio");
}

function initializeWaveformIntegration() {
  if (integrationInitialized) {
    return;
  }

  const audioElement = getAudioElement();

  if (!audioElement) {
    return;
  }

  integrationInitialized = true;

  // Initialize waveform visualizer
  const waveformContainer = document.getElementById("waveform-visualizer");
  if (waveformContainer) {
    const waveformViz = new WaveformVisualizer("waveform-visualizer", {
      width: waveformContainer.clientWidth,
      height: 200,
      barCount: 64,
      theme: "neon-rose",
    });

    const connectPlayerAnalyser = () => {
      const playerState = getPlayerState();
      if (playerState?.analyser && typeof waveformViz.connectAnalyser === "function") {
        waveformViz.connectAnalyser(playerState.analyser, playerState.audioContext);
        return true;
      }
      return false;
    };

    if (!connectPlayerAnalyser()) {
      window.addEventListener("soundwave:audio-graph-ready", connectPlayerAnalyser, { once: true });

      if (!getPlayerState()) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const audioContext = new AudioContext();

          try {
            waveformViz.connectAudioContext(audioElement, audioContext);
          } catch (e) {
            console.warn("Could not connect audio context:", e.message);
          }
        }
      }
    }

    // Sync playback state
    audioElement.addEventListener("play", () => {
      waveformViz.play();
    });

    audioElement.addEventListener("pause", () => {
      waveformViz.pause();
    });

    if (!audioElement.paused) {
      waveformViz.play();
    }

    // Update volume
    const volumeRange = document.getElementById("volumeRange");
    if (volumeRange) {
      volumeRange.addEventListener("input", (e) => {
        waveformViz.setVolume(e.target.value);
      });
    }

    // Initialize color theme controller
    const themeControl = document.getElementById("theme-control");
    if (themeControl) {
      new ColorThemeController("waveform-visualizer", "theme-control");
    }

    // Store reference for later use
    window.waveformVisualizer = waveformViz;
  }

  // Setup immersive theater button
  const immersiveBtn = document.getElementById("immersiveTheaterBtn");
  if (immersiveBtn) {
    immersiveBtn.addEventListener("click", () => {
      openImmersiveTheater(audioElement);
    });
  }
}

function openImmersiveTheater(audioElement) {
  // Store current audio state in session storage
  const currentSrc = audioElement.src;
  const currentTime = audioElement.currentTime;
  const isPlaying = !audioElement.paused;
  const volume = audioElement.volume;
  const playerState = getPlayerState();
  const playlist = playerState?.playlist || null;
  const songs = Array.isArray(playerState?.songs) ? playerState.songs : [];
  const currentIndex = Number.isInteger(playerState?.index) ? playerState.index : 0;
  const currentSong = songs[currentIndex] || playerState?.currentSong || null;
  const playlistId = playlist?.id || playlist?.playlistId || new URLSearchParams(window.location.search).get("playlist") || "local";
  const playCounts = getJSON("sw_play_counts", {});
  const downloadBtn = document.getElementById("downloadBtn");
  const canDownload = Boolean(downloadBtn?.hasAttribute("download"));

  const trackTitle = document.getElementById("trackTitle")?.textContent || "Now Playing";
  const trackMeta = document.getElementById("trackMeta")?.textContent || "Artist";
  const albumArt = document.getElementById("albumArt")?.src || "img/soundwave.svg";
  const [artist = trackMeta, album = "Album"] = trackMeta
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  const songKeyFor = (song) => `${playlistId || "local"}:${song?.filename || song?.fileUrl || song?.id || song?.title || "track"}`;
  const queue = songs.map((song) => {
    const folder = playlist?.folder ? encodeURIComponent(playlist.folder) : "";
    const fileName = song.filename ? encodeURIComponent(song.filename) : "";
    const src = song.fileUrl || (folder && fileName ? `/songs/${folder}/${fileName}` : "");
    const key = songKeyFor(song);

    return {
      id: song.id || null,
      title: song.title || song.filename || "Untitled Track",
      artist: song.artistName || artist || "Artist",
      album: song.albumTitle || song.playlistTitle || album || "Album",
      playlistTitle: song.playlistTitle || playlist?.title || "",
      genre: song.genre || playlist?.genre || "",
      quality: song.quality || "320kbps",
      duration: song.duration || 0,
      filename: song.filename || "",
      albumArt: song.coverUrl || albumArt,
      src,
      canDownload,
      likeKey: key,
      playKey: key,
      plays: Number(playCounts[key] || 0),
    };
  });
  const currentKey = currentSong ? songKeyFor(currentSong) : "";

  const audioData = {
    src: currentSrc,
    currentTime: currentTime,
    autoPlay: isPlaying,
    volume: volume,
    muted: audioElement.muted,
    title: trackTitle,
    artist: artist,
    album: album,
    albumArt: albumArt,
    genre: currentSong?.genre || playlist?.genre || "",
    quality: currentSong?.quality || "320kbps",
    canDownload,
    likeKey: currentKey,
    playKey: currentKey,
    plays: Number(playCounts[currentKey] || 0),
    currentIndex: currentIndex,
    queue: queue,
    returnUrl: `${window.location.pathname}${window.location.search}`,
  };

  sessionStorage.setItem("sw_current_audio", JSON.stringify(audioData));

  window.location.href = "immersive-theater.html?from=player";
}

// Handle responsive waveform resizing
window.addEventListener("resize", () => {
  if (window.waveformVisualizer) {
    const container = document.getElementById("waveform-visualizer");
    if (container) {
      window.waveformVisualizer.width = container.clientWidth;
      window.waveformVisualizer.initSVG();
    }
  }
});

// Export functions
window.openImmersiveTheater = openImmersiveTheater;
