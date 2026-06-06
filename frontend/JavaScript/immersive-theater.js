/**
 * ImmersiveTheater - Full-screen audio visualization and theater controls.
 */

const THEATER_PREFS_KEY = "sw_theater_prefs";
const THEATER_SONG_PREFS_KEY = "sw_theater_song_prefs";
const THEATER_PRESETS_KEY = "sw_theater_presets";

const DEFAULT_THEATER_PREFS = {
  visualizerMode: "blend",
  artworkMode: "vinyl",
  backgroundStyle: "aurora",
  playbackSpeed: 1,
  audioEffect: "flat",
  autoMood: true,
};

const VISUALIZER_MODES = ["blend", "waveform", "radial", "bars", "starfield", "liquid"];
const ARTWORK_MODES = ["vinyl", "cover", "cd", "cassette", "poster", "blur"];
const BACKGROUND_STYLES = ["aurora", "nightclub", "galaxy", "rain", "sunset", "vinyl-room", "minimal"];

function getJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function setJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

class ImmersiveTheater {
  constructor(audioElement) {
    this.audioElement = audioElement;
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.bassFilter = null;
    this.delayNode = null;
    this.wetGain = null;
    this.dryGain = null;
    this.panner = null;
    this.waveformVisualizer = null;
    this.themeController = null;
    this.particleSystem = null;
    this.frequencyData = new Uint8Array(128);
    this.currentTheme = "neon-rose";
    this.queue = [];
    this.currentIndex = 0;
    this.isShuffle = false;
    this.repeatMode = "all";
    this.returnUrl = "player.html";
    this.currentLyrics = [];
    this.activeLyricIndex = -1;
    this.dragIndex = null;
    this.controlsTimer = 0;
    this.spatialPhase = 0;
    this.currentTrackMeta = {};
    this.prefs = {
      ...DEFAULT_THEATER_PREFS,
      ...getJSON(THEATER_PREFS_KEY, {}),
    };
    this.currentTheme =
      window.SoundwaveThemeSystem?.normalizeTheme(
        localStorage.getItem("sw_waveform_theme") || this.currentTheme
      ) || this.currentTheme;

    this.init();
  }

  init() {
    this.cacheElements();
    this.setupAudioContext();
    this.setupEventListeners();
    this.initializeVisualizers();
    this.setupThemeSync();
    this.applyPreferences({ persist: false });
    this.renderEqBars();
    this.startIdleClock();
    this.revealControls();
    window.SoundwaveThemeSystem?.applyTheme(this.currentTheme);
  }

  cacheElements() {
    this.root = document.getElementById("immersive-theater");
    this.bgCover = document.getElementById("theater-bg-cover");
    this.eqBars = document.getElementById("theater-eq-bars");
    this.artworkProgress = document.getElementById("artwork-progress");
    this.trackTitleEl = document.getElementById("theater-track-title");
    this.trackArtistEl = document.getElementById("theater-track-artist");
    this.trackAlbumEl = document.getElementById("theater-track-album");
    this.miniGenre = document.getElementById("miniGenre");
    this.miniQuality = document.getElementById("miniQuality");
    this.miniPlays = document.getElementById("miniPlays");
    this.queueDrawer = document.getElementById("queueDrawer");
    this.queueList = document.getElementById("theaterQueueList");
    this.shortcutsOverlay = document.getElementById("shortcutsOverlay");
    this.roomPanel = document.getElementById("roomPanel");
    this.lyricsDisplay = document.querySelector(".lyrics-display");
    this.lyricsContent = document.getElementById("lyrics-content");
    this.toast = document.getElementById("theaterToast");
    this.idle = document.getElementById("ambientIdle");
    this.idleClock = document.getElementById("idleClock");
    this.downloadLink = document.getElementById("theaterDownload");
  }

  setupAudioContext() {
    if (this.audioContext) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.82;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

    try {
      this.source = this.audioContext.createMediaElementSource(this.audioElement);
      this.bassFilter = this.audioContext.createBiquadFilter();
      this.bassFilter.type = "lowshelf";
      this.bassFilter.frequency.value = 180;
      this.bassFilter.gain.value = 0;

      this.dryGain = this.audioContext.createGain();
      this.delayNode = this.audioContext.createDelay(0.6);
      this.delayNode.delayTime.value = 0.16;
      this.wetGain = this.audioContext.createGain();
      this.wetGain.gain.value = 0;

      this.panner = this.audioContext.createStereoPanner
        ? this.audioContext.createStereoPanner()
        : null;

      const mixTarget = this.panner || this.analyser;
      this.source.connect(this.bassFilter);
      this.bassFilter.connect(this.dryGain);
      this.dryGain.connect(mixTarget);
      this.bassFilter.connect(this.delayNode);
      this.delayNode.connect(this.wetGain);
      this.wetGain.connect(mixTarget);
      if (this.panner) this.panner.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    } catch (err) {
      console.warn("Could not initialize theater audio graph:", err.message);
    }
  }

  setupEventListeners() {
    this.on("theater-play", "click", () => this.togglePlayPause());
    this.on("theater-prev", "click", () => this.previousTrack());
    this.on("theater-next", "click", () => this.nextTrack());
    this.on("exit-theater", "click", () => this.exitTheater());
    this.on("theater-shuffle", "click", () => this.toggleShuffle());
    this.on("theater-repeat", "click", () => this.toggleRepeat());
    this.on("theater-mute", "click", () => this.toggleMute());
    this.on("toggleLyrics", "click", () => this.toggleLyrics());
    this.on("toggleQueue", "click", () => this.toggleQueue());
    this.on("toggleShortcuts", "click", () => this.toggleShortcuts());
    this.on("toggleRoom", "click", () => this.toggleRoom());
    this.on("closeQueue", "click", () => this.toggleQueue(false));
    this.on("closeShortcuts", "click", () => this.toggleShortcuts(false));
    this.on("closeRoom", "click", () => this.toggleRoom(false));
    this.on("close-lyrics", "click", () => this.toggleLyrics(false));
    this.on("theaterLike", "click", () => this.toggleFavorite());
    this.on("theaterShare", "click", () => this.shareCurrentTrack());
    this.on("copyRoomLink", "click", () => this.copyRoomLink());
    this.on("saveTheaterPreset", "click", () => this.saveTheaterPreset());
    this.on("resetTheaterPreset", "click", () => this.resetTheaterPreset());

    const volumeSlider = document.getElementById("theater-volume");
    volumeSlider?.addEventListener("input", (event) => {
      this.setVolume(event.target.value);
    });

    const speedSelect = document.getElementById("playbackSpeed");
    speedSelect?.addEventListener("change", (event) => {
      this.prefs.playbackSpeed = Number(event.target.value) || 1;
      this.applyPlaybackSpeed();
      this.persistPreferences();
      this.saveSongPreferences();
    });

    const effectSelect = document.getElementById("audioEffect");
    effectSelect?.addEventListener("change", (event) => {
      this.prefs.audioEffect = event.target.value || "flat";
      this.applyAudioEffect();
      this.persistPreferences();
      this.saveSongPreferences();
    });

    const progressBar = document.querySelector(".progress-bar");
    progressBar?.addEventListener("click", (event) => {
      const rect = progressBar.getBoundingClientRect();
      const percent = (event.clientX - rect.left) / rect.width;
      if (this.audioElement?.duration) {
        this.audioElement.currentTime = percent * this.audioElement.duration;
      }
    });

    document.querySelectorAll("[data-panel]").forEach((button) => {
      button.addEventListener("click", () => this.activateOptionPanel(button.dataset.panel));
    });

    document.querySelectorAll("[data-visualizer-mode]").forEach((button) => {
      button.addEventListener("click", () => this.setVisualizerMode(button.dataset.visualizerMode));
    });

    document.querySelectorAll("[data-artwork-mode]").forEach((button) => {
      button.addEventListener("click", () => this.setArtworkMode(button.dataset.artworkMode));
    });

    document.querySelectorAll("[data-background-style]").forEach((button) => {
      button.addEventListener("click", () => this.setBackgroundStyle(button.dataset.backgroundStyle));
    });

    this.queueList?.addEventListener("click", (event) => {
      const playButton = event.target.closest("[data-queue-play]");
      if (!playButton) return;
      this.currentIndex = Number(playButton.dataset.queuePlay);
      this.loadTrack(this.getCurrentTrack(), { autoPlay: true });
      this.toggleQueue(false);
    });

    this.queueList?.addEventListener("dragstart", (event) => {
      const item = event.target.closest("[data-queue-index]");
      if (!item) return;
      this.dragIndex = Number(item.dataset.queueIndex);
      event.dataTransfer.effectAllowed = "move";
    });

    this.queueList?.addEventListener("dragover", (event) => {
      if (this.dragIndex === null) return;
      event.preventDefault();
    });

    this.queueList?.addEventListener("drop", (event) => {
      event.preventDefault();
      const item = event.target.closest("[data-queue-index]");
      if (!item || this.dragIndex === null) return;
      this.reorderQueue(this.dragIndex, Number(item.dataset.queueIndex));
      this.dragIndex = null;
    });

    document.addEventListener("click", (event) => {
      const line = event.target.closest(".lyric-line");
      if (!line) return;
      const timestamp = parseFloat(line.dataset.timestamp) || 0;
      if (this.audioElement) this.audioElement.currentTime = timestamp;
    });

    document.addEventListener("keydown", (event) => this.handleKeyboard(event));
    ["mousemove", "pointermove", "click", "touchstart"].forEach((name) => {
      document.addEventListener(name, () => this.revealControls(), { passive: true });
    });

    if (this.audioElement) {
      this.audioElement.addEventListener("timeupdate", () => {
        this.updateProgress();
        this.updateActiveLyric();
      });
      this.audioElement.addEventListener("loadedmetadata", () => this.updateProgress());
      this.audioElement.addEventListener("play", () => this.onPlay());
      this.audioElement.addEventListener("pause", () => this.onPause());
      this.audioElement.addEventListener("ended", () => this.handleEnded());
    }
  }

  on(id, eventName, handler) {
    document.getElementById(id)?.addEventListener(eventName, handler);
  }

  initializeVisualizers() {
    this.waveformVisualizer = new WaveformVisualizer("waveform-d3-viz", {
      theme: this.currentTheme,
      barCount: 72,
    });
    if (typeof this.waveformVisualizer.connectAnalyser === "function") {
      this.waveformVisualizer.connectAnalyser(this.analyser, this.audioContext);
    }

    this.themeController = new ColorThemeController("waveform-d3-viz", "theme-control-container");
    this.initRadialSpectrum();
    this.initParticleSystem();
    this.startAnimationLoop();
  }

  setupThemeSync() {
    window.addEventListener("soundwave:theme-change", (event) => {
      this.currentTheme = event.detail.key;
      this.root?.classList.add("theme-transitioning");
      this.syncThemeVisuals();
      window.setTimeout(() => this.root?.classList.remove("theme-transitioning"), 420);
    });
  }

  renderEqBars() {
    if (!this.eqBars) return;
    this.eqBars.innerHTML = Array.from({ length: 42 }, (_, index) => {
      const height = 16 + ((index * 19) % 64);
      return `<span style="--bar-height:${height}%"></span>`;
    }).join("");
    this.eqBarEls = Array.from(this.eqBars.querySelectorAll("span"));
  }

  getCssVar(name, fallback = "") {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  getCssRgb(name, fallback = "61, 220, 132") {
    return this.getCssVar(name, fallback).replace(/\s+/g, " ");
  }

  syncThemeVisuals() {
    const accent = this.getCssVar("--theater-accent", "#3ddc84");
    const border = this.getCssVar("--theater-border", "rgba(255, 255, 255, 0.12)");

    this.radialGuide?.attr("stroke", border);
    this.radialBars?.attr("stroke", accent);
  }

  initRadialSpectrum() {
    const svg = document.getElementById("radial-spectrum");
    if (!svg || !window.d3) return;

    const width = 500;
    const height = 500;
    const radius = Math.min(width, height) / 2 - 20;

    svg.setAttribute("viewBox", `${-width / 2} ${-height / 2} ${width} ${height}`);
    this.radialGroup = d3.select(svg).append("g").attr("class", "radial-spectrum-group");
    this.radialGuide = this.radialGroup
      .append("circle")
      .attr("r", radius)
      .attr("fill", "none")
      .attr("stroke", "var(--theater-border)")
      .attr("stroke-width", 1);

    const barCount = 72;
    this.radialBars = this.radialGroup
      .selectAll(".radial-bar")
      .data(d3.range(barCount))
      .enter()
      .append("line")
      .attr("class", "radial-bar")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", -radius * 0.6)
      .attr("stroke", "var(--theater-accent)")
      .attr("stroke-linecap", "round")
      .attr("stroke-width", 3)
      .attr("opacity", 0.55)
      .attr("transform", (d, i) => `rotate(${(i / barCount) * 360})`);

    this.syncThemeVisuals();
  }

  initParticleSystem() {
    const canvas = document.getElementById("particle-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const particles = [];
    const particleCount = 54;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.85,
        vy: (Math.random() - 0.5) * 0.85,
        radius: Math.random() * 2.4 + 0.8,
        opacity: Math.random() * 0.26 + 0.11,
        colorOffset: Math.random() > 0.52 ? "--theater-accent-rgb" : "--theater-art-rgb",
      });
    }

    this.particleSystem = {
      canvas,
      ctx,
      particles,
      draw: (energy = 0) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const starfield = this.prefs.visualizerMode === "starfield";
        particles.forEach((particle, index) => {
          const frequency = this.frequencyData[index % this.frequencyData.length] / 255 || 0;
          const speed = starfield ? 1.9 : 1;
          const scale = 1 + frequency * (starfield ? 1.2 : 0.55) + energy * 0.25;

          particle.x += particle.vx * speed;
          particle.y += particle.vy * speed;

          if (particle.x < -8) particle.x = canvas.width + 8;
          if (particle.x > canvas.width + 8) particle.x = -8;
          if (particle.y < -8) particle.y = canvas.height + 8;
          if (particle.y > canvas.height + 8) particle.y = -8;

          ctx.fillStyle = `rgb(${this.getCssRgb(particle.colorOffset)})`;
          ctx.globalAlpha = particle.opacity * (0.48 + frequency * 0.78);
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.radius * scale, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      },
    };

    window.addEventListener("resize", resize);
  }

  updateRadialBars(frequencyData) {
    if (!this.radialBars) return;
    this.radialBars.attr("y2", (d, i) => {
      const value = frequencyData[i] || 0;
      return (-132 * value) / 255 - 52;
    });
  }

  updateEqBars(frequencyData) {
    if (!this.eqBarEls?.length) return;
    this.eqBarEls.forEach((bar, index) => {
      const value = frequencyData[index % frequencyData.length] || 0;
      const height = Math.max(10, Math.round((value / 255) * 92));
      bar.style.setProperty("--bar-height", `${height}%`);
    });
  }

  startAnimationLoop() {
    const animate = () => {
      let bassEnergy = 0;
      let averageEnergy = 0;

      if (this.analyser) {
        this.analyser.getByteFrequencyData(this.frequencyData);
        const bassBins = Math.min(14, this.frequencyData.length);
        bassEnergy = Array.from(this.frequencyData.slice(0, bassBins))
          .reduce((sum, value) => sum + value, 0) / (bassBins * 255);
        averageEnergy = Array.from(this.frequencyData)
          .reduce((sum, value) => sum + value, 0) / (this.frequencyData.length * 255);
        this.updateRadialBars(this.frequencyData);
        this.updateEqBars(this.frequencyData);
      }

      const beatScale = 1 + bassEnergy * 0.055;
      const beatGlow = 0.36 + bassEnergy * 0.78;
      document.documentElement.style.setProperty("--beat-scale", beatScale.toFixed(3));
      document.documentElement.style.setProperty("--beat-glow", beatGlow.toFixed(3));
      document.documentElement.style.setProperty("--spectrum-energy", averageEnergy.toFixed(3));
      this.root?.classList.toggle("beat-hit", bassEnergy > 0.58);

      if (this.panner && this.prefs.audioEffect === "spatial" && !this.audioElement?.paused) {
        this.spatialPhase += 0.018;
        this.panner.pan.value = Math.sin(this.spatialPhase) * 0.32;
      }

      this.particleSystem?.draw(averageEnergy);
      this.updatePlayButton();
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  applyPreferences(options = {}) {
    this.setVisualizerMode(this.prefs.visualizerMode, { persist: false });
    this.setArtworkMode(this.prefs.artworkMode, { persist: false });
    this.setBackgroundStyle(this.prefs.backgroundStyle, { persist: false });
    this.applyPlaybackSpeed();
    this.applyAudioEffect();
    this.syncModeButtons();
    if (options.persist !== false) this.persistPreferences();
  }

  persistPreferences() {
    setJSON(THEATER_PREFS_KEY, this.prefs);
  }

  saveSongPreferences() {
    const key = this.getTrackKey(this.getCurrentTrack());
    if (!key) return;
    const all = getJSON(THEATER_SONG_PREFS_KEY, {});
    all[key] = {
      visualizerMode: this.prefs.visualizerMode,
      artworkMode: this.prefs.artworkMode,
      backgroundStyle: this.prefs.backgroundStyle,
      playbackSpeed: this.prefs.playbackSpeed,
      audioEffect: this.prefs.audioEffect,
    };
    setJSON(THEATER_SONG_PREFS_KEY, all);
  }

  applySongPreferences(track) {
    const key = this.getTrackKey(track);
    const songPrefs = key ? getJSON(THEATER_SONG_PREFS_KEY, {})[key] : null;
    if (songPrefs) {
      this.prefs = { ...this.prefs, ...songPrefs };
      this.applyPreferences({ persist: false });
      return;
    }
    if (this.prefs.autoMood) this.applyMoodFromTrack(track);
  }

  applyMoodFromTrack(track) {
    const text = `${track?.genre || ""} ${track?.album || ""} ${track?.playlistTitle || ""} ${track?.title || ""}`.toLowerCase();
    if (!text.trim()) return;

    if (/(bollywood|hindi|punjabi|desi|top charts)/.test(text)) {
      this.setBackgroundStyle("sunset", { persist: false });
      return;
    }
    if (/(electronic|edm|club|dance|pop)/.test(text)) {
      this.setBackgroundStyle("nightclub", { persist: false });
      return;
    }
    if (/(chill|lofi|acoustic|ambient|sleep)/.test(text)) {
      this.setBackgroundStyle("minimal", { persist: false });
      return;
    }
    if (/(rock|metal|trap|hip hop|rap)/.test(text)) {
      this.setBackgroundStyle("galaxy", { persist: false });
    }
  }

  setVisualizerMode(mode, options = {}) {
    const next = VISUALIZER_MODES.includes(mode) ? mode : DEFAULT_THEATER_PREFS.visualizerMode;
    this.prefs.visualizerMode = next;
    this.root?.setAttribute("data-visualizer-mode", next);
    this.syncModeButtons();
    if (options.persist !== false) {
      this.persistPreferences();
      this.saveSongPreferences();
    }
  }

  setArtworkMode(mode, options = {}) {
    const next = ARTWORK_MODES.includes(mode) ? mode : DEFAULT_THEATER_PREFS.artworkMode;
    this.prefs.artworkMode = next;
    this.root?.setAttribute("data-artwork-mode", next);
    this.syncModeButtons();
    if (options.persist !== false) {
      this.persistPreferences();
      this.saveSongPreferences();
    }
  }

  setBackgroundStyle(style, options = {}) {
    const next = BACKGROUND_STYLES.includes(style) ? style : DEFAULT_THEATER_PREFS.backgroundStyle;
    this.prefs.backgroundStyle = next;
    this.root?.setAttribute("data-background-style", next);
    this.syncModeButtons();
    if (options.persist !== false) {
      this.persistPreferences();
      this.saveSongPreferences();
    }
  }

  syncModeButtons() {
    document.querySelectorAll("[data-visualizer-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.visualizerMode === this.prefs.visualizerMode);
    });
    document.querySelectorAll("[data-artwork-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.artworkMode === this.prefs.artworkMode);
    });
    document.querySelectorAll("[data-background-style]").forEach((button) => {
      button.classList.toggle("active", button.dataset.backgroundStyle === this.prefs.backgroundStyle);
    });
    const speedSelect = document.getElementById("playbackSpeed");
    if (speedSelect) speedSelect.value = String(this.prefs.playbackSpeed || 1);
    const effectSelect = document.getElementById("audioEffect");
    if (effectSelect) effectSelect.value = this.prefs.audioEffect || "flat";
  }

  activateOptionPanel(panelId) {
    document.querySelectorAll(".mode-dock-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.panel === panelId);
    });
    document.querySelectorAll(".theater-option-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === panelId);
    });
    this.revealControls();
  }

  applyPlaybackSpeed() {
    if (!this.audioElement) return;
    this.audioElement.playbackRate = Number(this.prefs.playbackSpeed) || 1;
    this.updateMiniCard();
  }

  applyAudioEffect() {
    const mode = this.prefs.audioEffect || "flat";
    if (this.bassFilter) this.bassFilter.gain.value = mode === "bass" ? 8 : mode === "soft" ? 2 : 0;
    if (this.wetGain) this.wetGain.gain.value = mode === "soft" ? 0.26 : 0;
    if (this.panner && mode !== "spatial") this.panner.pan.value = 0;
  }

  saveTheaterPreset() {
    const name = window.prompt?.("Preset name", "My Theater") || "My Theater";
    const presets = getJSON(THEATER_PRESETS_KEY, {});
    presets[name.trim() || "My Theater"] = { ...this.prefs };
    setJSON(THEATER_PRESETS_KEY, presets);
    this.persistPreferences();
    this.showToast("Theater preset saved");
  }

  resetTheaterPreset() {
    this.prefs = { ...DEFAULT_THEATER_PREFS };
    this.applyPreferences();
    this.saveSongPreferences();
    this.showToast("Theater preset reset");
  }

  updateProgress() {
    if (!this.audioElement) return;

    const duration = this.audioElement.duration || 0;
    const percent = duration ? (this.audioElement.currentTime / duration) * 100 : 0;
    const progressFill = document.getElementById("progress-fill");
    if (progressFill) progressFill.style.width = `${percent}%`;

    if (this.artworkProgress) {
      const circumference = 2 * Math.PI * 56;
      this.artworkProgress.style.strokeDasharray = `${circumference}`;
      this.artworkProgress.style.strokeDashoffset = `${circumference - (percent / 100) * circumference}`;
    }

    const currentTime = document.getElementById("current-time");
    const durationTime = document.getElementById("duration-time");
    if (currentTime) currentTime.textContent = this.formatTime(this.audioElement.currentTime);
    if (durationTime) durationTime.textContent = this.formatTime(duration);
  }

  formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  updatePlayButton() {
    const playBtn = document.getElementById("theater-play");
    const icon = playBtn?.querySelector(".btn-icon");
    if (!icon) return;
    icon.textContent = this.audioElement && !this.audioElement.paused ? "II" : ">";
  }

  onPlay() {
    this.waveformVisualizer?.play();
    document.querySelector(".artwork-disc")?.classList.remove("paused");
    this.root?.classList.remove("is-paused");
    this.revealControls();
  }

  onPause() {
    this.waveformVisualizer?.pause();
    document.querySelector(".artwork-disc")?.classList.add("paused");
    this.root?.classList.add("is-paused");
    this.revealControls({ keepVisible: true });
  }

  async togglePlayPause() {
    if (!this.audioElement) return;
    if (this.audioElement.paused) {
      await this.playAudio();
    } else {
      this.audioElement.pause();
    }
  }

  previousTrack() {
    if (!this.queue.length) return;
    this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    this.loadTrack(this.getCurrentTrack(), { autoPlay: true });
  }

  nextTrack() {
    if (!this.queue.length) return;
    if (this.isShuffle && this.queue.length > 1) {
      const available = this.queue.map((_, idx) => idx).filter((idx) => idx !== this.currentIndex);
      this.currentIndex = available[Math.floor(Math.random() * available.length)] ?? this.currentIndex;
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    }
    this.loadTrack(this.getCurrentTrack(), { autoPlay: true });
  }

  handleEnded() {
    if (this.repeatMode === "one") {
      this.loadTrack(this.getCurrentTrack(), { autoPlay: true });
      return;
    }
    if (this.repeatMode === "off" && this.currentIndex === this.queue.length - 1) {
      this.onPause();
      return;
    }
    this.nextTrack();
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    this.updateModeLabels();
    this.showToast(this.isShuffle ? "Shuffle on" : "Shuffle off");
  }

  toggleRepeat() {
    if (this.repeatMode === "all") this.repeatMode = "one";
    else if (this.repeatMode === "one") this.repeatMode = "off";
    else this.repeatMode = "all";
    this.updateModeLabels();
    this.showToast(`Repeat ${this.repeatMode}`);
  }

  updateModeLabels() {
    const shuffleBtn = document.getElementById("theater-shuffle");
    const repeatBtn = document.getElementById("theater-repeat");
    if (shuffleBtn) {
      shuffleBtn.classList.toggle("active", this.isShuffle);
      shuffleBtn.title = `Shuffle: ${this.isShuffle ? "On" : "Off"}`;
      shuffleBtn.dataset.state = this.isShuffle ? "On" : "Off";
    }
    if (repeatBtn) {
      repeatBtn.classList.toggle("active", this.repeatMode !== "off");
      repeatBtn.title = `Repeat: ${this.repeatMode}`;
      repeatBtn.dataset.state = this.repeatMode === "all" ? "All" : this.repeatMode === "one" ? "One" : "Off";
    }
  }

  toggleMute() {
    if (!this.audioElement) return;
    this.audioElement.muted = !this.audioElement.muted;
    this.updateMuteButton();
  }

  setVolume(value) {
    if (!this.audioElement) return;
    this.audioElement.volume = Math.max(0, Math.min(1, Number(value) / 100));
  }

  updateMuteButton() {
    const muteBtn = document.getElementById("theater-mute");
    if (!muteBtn || !this.audioElement) return;
    const icon = muteBtn.querySelector(".btn-icon");
    if (icon) icon.textContent = this.audioElement.muted ? "Mute" : "Vol";
    muteBtn.classList.toggle("active", this.audioElement.muted);
  }

  updateTrackInfo(track) {
    const title = track?.title || "Now Playing";
    const artist = track?.artist || "Artist";
    const album = track?.album || "Album";
    if (this.trackTitleEl) this.trackTitleEl.textContent = title;
    if (this.trackArtistEl) this.trackArtistEl.textContent = artist;
    if (this.trackAlbumEl) this.trackAlbumEl.textContent = album;
    this.currentTrackMeta = { ...track, title, artist, album };
    this.updateMiniCard();
  }

  updateMiniCard() {
    const track = this.currentTrackMeta || {};
    const genre = track.genre || this.inferGenre(track) || "Music";
    const quality = track.quality || "320kbps";
    const plays = this.getPlayCount(track);
    if (this.miniGenre) this.miniGenre.textContent = `Genre: ${genre}`;
    if (this.miniQuality) this.miniQuality.textContent = `Quality: ${quality}`;
    if (this.miniPlays) this.miniPlays.textContent = `Plays: ${plays}`;
  }

  inferGenre(track) {
    const text = `${track?.title || ""} ${track?.album || ""}`.toLowerCase();
    if (/hindi|bollywood|punjabi|desi/.test(text)) return "Bollywood";
    if (/lofi|chill/.test(text)) return "Chill";
    if (/rock|metal/.test(text)) return "Rock";
    if (/rap|hip hop|trap/.test(text)) return "Hip-Hop";
    return "";
  }

  getTrackKey(track) {
    if (!track) return "";
    return track.playKey || track.likeKey || track.id || track.src || track.title || "";
  }

  getPlayCount(track) {
    const key = this.getTrackKey(track);
    const counts = getJSON("sw_play_counts", {});
    return Number(counts[key] || track?.plays || 0);
  }

  setQueue(queue, currentIndex = 0) {
    this.queue = Array.isArray(queue) ? queue.filter((track) => track && track.src) : [];
    this.currentIndex = Math.max(0, Math.min(currentIndex, this.queue.length - 1));
    this.renderQueue();
  }

  getCurrentTrack() {
    return this.queue[this.currentIndex] || null;
  }

  async playAudio() {
    if (!this.audioElement) return;
    if (this.audioContext?.state === "suspended") await this.audioContext.resume();
    try {
      await this.audioElement.play();
    } catch (err) {
      console.warn("Playback needs a user gesture:", err.message);
      this.onPause();
    }
  }

  loadTrack(track, options = {}) {
    if (!track || !track.src || !this.audioElement) return;

    const wasPlaying = options.autoPlay ?? !this.audioElement.paused;
    this.audioElement.src = track.src;
    this.audioElement.volume = Number.isFinite(options.volume)
      ? Math.max(0, Math.min(1, options.volume))
      : this.audioElement.volume;
    this.audioElement.muted =
      typeof options.muted === "boolean" ? options.muted : this.audioElement.muted;

    const volumeSlider = document.getElementById("theater-volume");
    if (volumeSlider) volumeSlider.value = Math.round(this.audioElement.volume * 100);

    this.applySongPreferences(track);
    this.applyPlaybackSpeed();
    this.applyAudioEffect();
    this.updateMuteButton();
    this.updateTrackInfo(track);
    this.updateAlbumArt(track.albumArt || "img/soundwave.svg");
    this.updateLyrics(track.lyrics || this.createFallbackLyrics(track));
    this.updateDownload(track);
    this.updateFavoriteButton(track);
    this.renderQueue();
    this.updateProgress();
    this.updateMediaSession(track);

    const startAt = Number(options.currentTime || 0);
    if (startAt > 0) {
      this.audioElement.addEventListener(
        "loadedmetadata",
        () => {
          try {
            this.audioElement.currentTime = Math.min(startAt, this.audioElement.duration || startAt);
          } catch (err) {
            console.debug("Could not restore theater playback position:", err.message);
          }
        },
        { once: true }
      );
    }

    if (wasPlaying) this.playAudio();
  }

  updateAlbumArt(src) {
    const img = document.getElementById("theater-album-art");
    if (img) img.src = src;
    if (this.bgCover) this.bgCover.src = src;
    this.applyAlbumColor(src);
  }

  applyAlbumColor(src) {
    if (!src) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 16) {
          const alpha = data[i + 3];
          if (alpha < 160) continue;

          const pr = data[i];
          const pg = data[i + 1];
          const pb = data[i + 2];
          const brightness = (pr + pg + pb) / 3;
          if (brightness < 20 || brightness > 238) continue;

          r += pr;
          g += pg;
          b += pb;
          count++;
        }

        if (!count) return;

        const primary = this.normalizeAlbumRgb([
          Math.round(r / count),
          Math.round(g / count),
          Math.round(b / count),
        ]);
        const secondary = primary.map((value) => Math.min(255, Math.round(value * 1.18 + 8)));

        document.documentElement.style.setProperty("--theater-art-rgb", primary.join(", "));
        document.documentElement.style.setProperty("--theater-art-2-rgb", secondary.join(", "));
        document.documentElement.style.setProperty("--theater-song-primary", `rgb(${primary.join(", ")})`);
        document.documentElement.style.setProperty("--theater-song-secondary", `rgb(${secondary.join(", ")})`);
      } catch (err) {
        console.debug("Could not extract album color:", err.message);
      }
    };
    img.src = src;
  }

  normalizeAlbumRgb(rgb) {
    const average = rgb.reduce((sum, value) => sum + value, 0) / 3;
    if (average < 86) return rgb.map((value) => Math.min(255, Math.round(value * 1.45 + 18)));
    if (average > 198) return rgb.map((value) => Math.max(0, Math.round(value * 0.72)));
    return rgb;
  }

  createFallbackLyrics(track) {
    const title = track?.title || "This track";
    const artist = track?.artist || "Soundwave Studio";
    return [
      { timestamp: 0, text: title },
      { timestamp: 8, text: artist },
      { timestamp: 16, text: track?.album || "Now playing" },
      { timestamp: 24, text: "No synced lyrics were provided for this song." },
      { timestamp: 32, text: "Enjoy the immersive theater visualizer." },
    ];
  }

  updateLyrics(lyricsArray) {
    if (!this.lyricsContent) return;
    this.currentLyrics = Array.isArray(lyricsArray) ? lyricsArray : [];

    if (!this.currentLyrics.length) {
      this.lyricsContent.innerHTML = '<p class="lyric-line">No lyrics available</p>';
      return;
    }

    this.lyricsContent.innerHTML = this.currentLyrics
      .map((lyric, index) => {
        const timestamp = Number(lyric.timestamp ?? index * 8);
        return `<p class="lyric-line" data-lyric-index="${index}" data-timestamp="${timestamp}">${escapeHtml(lyric.text || lyric)}</p>`;
      })
      .join("");
    this.activeLyricIndex = -1;
    this.updateActiveLyric();
  }

  updateActiveLyric() {
    if (!this.currentLyrics.length || !this.audioElement) return;
    const current = this.audioElement.currentTime || 0;
    let activeIndex = 0;
    this.currentLyrics.forEach((line, index) => {
      const timestamp = Number(line.timestamp ?? index * 8);
      if (timestamp <= current) activeIndex = index;
    });
    if (activeIndex === this.activeLyricIndex) return;
    this.activeLyricIndex = activeIndex;
    this.lyricsContent?.querySelectorAll(".lyric-line").forEach((line) => {
      line.classList.toggle("active", Number(line.dataset.lyricIndex) === activeIndex);
    });
    this.lyricsContent?.querySelector(".lyric-line.active")?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }

  toggleLyrics(forceOpen) {
    const open = typeof forceOpen === "boolean" ? forceOpen : !this.root?.classList.contains("lyrics-open");
    this.root?.classList.toggle("lyrics-open", open);
    document.getElementById("toggleLyrics")?.classList.toggle("active", open);
    this.revealControls({ keepVisible: open });
  }

  renderQueue() {
    if (!this.queueList) return;
    if (!this.queue.length) {
      this.queueList.innerHTML = '<div class="queue-empty">No queue loaded.</div>';
      return;
    }
    this.queueList.innerHTML = this.queue
      .map((track, index) => {
        const active = index === this.currentIndex ? " active" : "";
        return `
          <div class="queue-row${active}" draggable="true" data-queue-index="${index}">
            <span class="queue-grip" aria-hidden="true">::</span>
            <img src="${escapeHtml(track.albumArt || "img/soundwave.svg")}" alt="">
            <div>
              <strong>${escapeHtml(track.title || "Untitled Track")}</strong>
              <span>${escapeHtml(track.artist || "Artist")}</span>
            </div>
            <button type="button" data-queue-play="${index}">${active ? "Playing" : "Play"}</button>
          </div>
        `;
      })
      .join("");
  }

  reorderQueue(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const moved = this.queue.splice(fromIndex, 1)[0];
    this.queue.splice(toIndex, 0, moved);
    if (this.currentIndex === fromIndex) this.currentIndex = toIndex;
    else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) this.currentIndex--;
    else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) this.currentIndex++;
    this.renderQueue();
    this.showToast("Queue reordered");
  }

  toggleQueue(forceOpen) {
    if (!this.queueDrawer) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : this.queueDrawer.hidden;
    this.queueDrawer.hidden = !open;
    document.getElementById("toggleQueue")?.classList.toggle("active", open);
    this.revealControls({ keepVisible: open });
  }

  toggleShortcuts(forceOpen) {
    if (!this.shortcutsOverlay) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : this.shortcutsOverlay.hidden;
    this.shortcutsOverlay.hidden = !open;
    document.getElementById("toggleShortcuts")?.classList.toggle("active", open);
    this.revealControls({ keepVisible: open });
  }

  toggleRoom(forceOpen) {
    if (!this.roomPanel) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : this.roomPanel.hidden;
    this.roomPanel.hidden = !open;
    document.getElementById("toggleRoom")?.classList.toggle("active", open);
    this.revealControls({ keepVisible: open });
  }

  updateFavoriteButton(track = this.getCurrentTrack()) {
    const button = document.getElementById("theaterLike");
    if (!button) return;
    const liked = Boolean(getJSON("sw_likes", {})[this.getTrackKey(track)]);
    button.classList.toggle("active", liked);
    button.textContent = liked ? "Favorited" : "Favorite";
  }

  toggleFavorite() {
    const track = this.getCurrentTrack();
    if (!track) return;
    const likes = getJSON("sw_likes", {});
    const key = this.getTrackKey(track);
    if (likes[key]) delete likes[key];
    else likes[key] = true;
    setJSON("sw_likes", likes);
    this.updateFavoriteButton(track);
    this.showToast(likes[key] ? "Added to favorites" : "Removed from favorites");
  }

  updateDownload(track) {
    if (!this.downloadLink || !track) return;
    const canDownload = track.canDownload !== false;
    this.downloadLink.href = canDownload ? track.src : "premium.html";
    this.downloadLink.toggleAttribute("download", canDownload);
    this.downloadLink.textContent = canDownload ? "Download" : "Premium";
  }

  async shareCurrentTrack() {
    const track = this.getCurrentTrack();
    if (!track) return;
    const title = track.title || "Soundwave Studio";
    const text = `Listening to ${title} by ${track.artist || "Artist"}`;
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else if (navigator.clipboard) await navigator.clipboard.writeText(`${text} - ${url}`);
      this.showToast("Share link ready");
    } catch (err) {
      this.showToast("Share cancelled");
    }
  }

  async copyRoomLink() {
    const track = this.getCurrentTrack() || {};
    const params = new URLSearchParams({
      from: "room",
      title: track.title || "",
      artist: track.artist || "",
      time: String(Math.round(this.audioElement?.currentTime || 0)),
      visual: this.prefs.visualizerMode,
      art: this.prefs.artworkMode,
      scene: this.prefs.backgroundStyle,
      theme: this.currentTheme,
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    try {
      await navigator.clipboard?.writeText(url);
      this.showToast("Room link copied");
    } catch (err) {
      this.showToast("Room link ready");
    }
  }

  updateMediaSession(track) {
    if (!("mediaSession" in navigator) || !track) return;
    if ("MediaMetadata" in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || "Now Playing",
        artist: track.artist || "Soundwave Studio",
        album: track.album || "Music",
        artwork: track.albumArt ? [{ src: track.albumArt, sizes: "512x512", type: "image/png" }] : [],
      });
    }
    const actions = {
      play: () => this.playAudio(),
      pause: () => this.audioElement?.pause(),
      previoustrack: () => this.previousTrack(),
      nexttrack: () => this.nextTrack(),
      seekbackward: () => this.seekBy(-10),
      seekforward: () => this.seekBy(10),
      seekto: (details) => {
        if (this.audioElement && Number.isFinite(details.seekTime)) {
          this.audioElement.currentTime = details.seekTime;
        }
      },
    };
    Object.entries(actions).forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (err) {
        // Some browsers do not support every action.
      }
    });
  }

  seekBy(seconds) {
    if (!this.audioElement) return;
    const duration = this.audioElement.duration || this.audioElement.currentTime + seconds;
    this.audioElement.currentTime = Math.max(0, Math.min(duration, this.audioElement.currentTime + seconds));
  }

  handleKeyboard(event) {
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;

    if (event.code === "Space") {
      event.preventDefault();
      this.togglePlayPause();
    } else if (event.key === "ArrowRight") {
      this.seekBy(10);
    } else if (event.key === "ArrowLeft") {
      this.seekBy(-10);
    } else if (event.key.toLowerCase() === "m") {
      this.toggleMute();
    } else if (event.key.toLowerCase() === "l") {
      this.toggleLyrics();
    } else if (event.key.toLowerCase() === "q") {
      this.toggleQueue();
    } else if (event.key.toLowerCase() === "t") {
      this.activateOptionPanel("visualizerPanel");
      this.revealControls({ keepVisible: true });
    } else if (event.key.toLowerCase() === "v") {
      this.cycleMode("visualizer");
    } else if (event.key.toLowerCase() === "a") {
      this.cycleMode("artwork");
    } else if (event.key === "?" || event.key.toLowerCase() === "h") {
      this.toggleShortcuts();
    } else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "s") {
      // Prevent browser default "Save As" dialog
      event.preventDefault();
    } else if (event.key === "Escape") {
      if (!this.queueDrawer?.hidden) this.toggleQueue(false);
      else if (!this.shortcutsOverlay?.hidden) this.toggleShortcuts(false);
      else if (!this.roomPanel?.hidden) this.toggleRoom(false);
      else this.exitTheater();
    }
  }

  cycleMode(type) {
    if (type === "visualizer") {
      const index = VISUALIZER_MODES.indexOf(this.prefs.visualizerMode);
      this.setVisualizerMode(VISUALIZER_MODES[(index + 1) % VISUALIZER_MODES.length]);
    }
    if (type === "artwork") {
      const index = ARTWORK_MODES.indexOf(this.prefs.artworkMode);
      this.setArtworkMode(ARTWORK_MODES[(index + 1) % ARTWORK_MODES.length]);
    }
  }

  revealControls(options = {}) {
    this.root?.classList.remove("controls-hidden");
    window.clearTimeout(this.controlsTimer);
    const keepVisible =
      options.keepVisible ||
      this.audioElement?.paused ||
      !this.queueDrawer?.hidden ||
      !this.shortcutsOverlay?.hidden ||
      !this.roomPanel?.hidden ||
      this.root?.classList.contains("lyrics-open");
    if (keepVisible) return;
    this.controlsTimer = window.setTimeout(() => {
      this.root?.classList.add("controls-hidden");
    }, 3600);
  }

  startIdleClock() {
    const tick = () => {
      if (!this.idleClock) return;
      this.idleClock.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    };
    tick();
    window.setInterval(tick, 30000);
  }

  showToast(message) {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.classList.add("show");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), 1800);
  }

  exitTheater() {
    this.waveformVisualizer?.destroy();
    sessionStorage.setItem(
      "sw_theater_return",
      JSON.stringify({
        currentIndex: this.currentIndex,
        currentTime: this.audioElement?.currentTime || 0,
        autoPlay: Boolean(this.audioElement && !this.audioElement.paused),
        volume: this.audioElement?.volume ?? 0.8,
        muted: Boolean(this.audioElement?.muted),
      })
    );
    window.location.href = this.returnUrl || "player.html";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const audioElement = document.createElement("audio");
  audioElement.id = "theater-audio";
  audioElement.preload = "metadata";
  audioElement.hidden = true;
  document.body.appendChild(audioElement);

  window.immersiveTheater = new ImmersiveTheater(audioElement);

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("from") === "player") {
    const audioData = sessionStorage.getItem("sw_current_audio");
    if (audioData) {
      try {
        const data = JSON.parse(audioData);
        const fallbackTrack = {
          src: data.src,
          title: data.title,
          artist: data.artist,
          album: data.album,
          albumArt: data.albumArt,
          genre: data.genre,
          quality: data.quality,
          plays: data.plays,
          canDownload: data.canDownload,
          likeKey: data.likeKey,
          playKey: data.playKey,
        };
        const queue = Array.isArray(data.queue) && data.queue.length ? data.queue : [fallbackTrack];
        window.immersiveTheater.returnUrl = data.returnUrl || "player.html";
        window.immersiveTheater.setQueue(queue, Number(data.currentIndex || 0));
        window.immersiveTheater.loadTrack(window.immersiveTheater.getCurrentTrack(), {
          currentTime: Number(data.currentTime || 0),
          autoPlay: Boolean(data.autoPlay),
          volume: Number(data.volume),
          muted: Boolean(data.muted),
        });
      } catch (err) {
        console.warn("Could not load theater audio handoff:", err.message);
      }
    }
  } else if (urlParams.get("from") === "room") {
    window.immersiveTheater.setVisualizerMode(urlParams.get("visual") || "blend");
    window.immersiveTheater.setArtworkMode(urlParams.get("art") || "vinyl");
    window.immersiveTheater.setBackgroundStyle(urlParams.get("scene") || "aurora");
    window.immersiveTheater.updateTrackInfo({
      title: urlParams.get("title") || "Shared Theater Room",
      artist: urlParams.get("artist") || "Soundwave Studio",
      album: "Shared session",
    });
  }
});

window.ImmersiveTheater = ImmersiveTheater;
