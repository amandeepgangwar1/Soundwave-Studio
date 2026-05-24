/**
 * ImmersiveTheater - Full-screen immersive audio visualization
 * Features: Particle system, radial spectrum, lyrics sync, theme control
 */

class ImmersiveTheater {
  constructor(audioElement) {
    this.audioElement = audioElement;
    this.isActive = false;
    this.audioContext = null;
    this.analyser = null;
    this.waveformVisualizer = null;
    this.themeController = null;
    this.particleSystem = null;
    this.currentTheme = "neon-rose";
    this.queue = [];
    this.currentIndex = 0;
    this.isShuffle = false;
    this.repeatMode = "all";
    this.returnUrl = "player.html";
    this.currentTheme =
      window.SoundwaveThemeSystem?.normalizeTheme(
        localStorage.getItem("sw_waveform_theme") || this.currentTheme
      ) || this.currentTheme;

    this.init();
  }

  init() {
    this.setupAudioContext();
    this.setupEventListeners();
    this.initializeVisualizers();
    this.setupThemeSync();
    window.SoundwaveThemeSystem?.applyTheme(this.currentTheme);
  }

  setupAudioContext() {
    if (!this.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      try {
        this.source = this.audioContext.createMediaElementSource(this.audioElement);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
      } catch (err) {
        console.warn("Could not initialize theater audio graph:", err.message);
      }
    }
  }

  setupEventListeners() {
    // Play/Pause buttons
    const playBtn = document.getElementById("theater-play");
    const prevBtn = document.getElementById("theater-prev");
    const nextBtn = document.getElementById("theater-next");
    const exitBtn = document.getElementById("exit-theater");

    if (playBtn) {
      playBtn.addEventListener("click", () => this.togglePlayPause());
    }
    if (prevBtn) {
      prevBtn.addEventListener("click", () => this.previousTrack());
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", () => this.nextTrack());
    }
    if (exitBtn) {
      exitBtn.addEventListener("click", () => this.exitTheater());
    }

    // Shuffle and Repeat
    const shuffleBtn = document.getElementById("theater-shuffle");
    const repeatBtn = document.getElementById("theater-repeat");

    if (shuffleBtn) {
      shuffleBtn.addEventListener("click", () => this.toggleShuffle());
    }
    if (repeatBtn) {
      repeatBtn.addEventListener("click", () => this.toggleRepeat());
    }

    // Volume control
    const volumeSlider = document.getElementById("theater-volume");
    if (volumeSlider) {
      volumeSlider.addEventListener("input", (e) => {
        this.setVolume(e.target.value);
      });
    }

    // Progress bar
    const progressBar = document.querySelector(".progress-bar");
    if (progressBar) {
      progressBar.addEventListener("click", (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        if (this.audioElement) {
          this.audioElement.currentTime =
            percent * this.audioElement.duration;
        }
      });
    }

    // Mute button
    const muteBtn = document.getElementById("theater-mute");
    if (muteBtn) {
      muteBtn.addEventListener("click", () => this.toggleMute());
    }

    // Lyrics line click
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("lyric-line")) {
        const timestamp = parseFloat(e.target.dataset.timestamp) || 0;
        if (this.audioElement) {
          this.audioElement.currentTime = timestamp;
        }
      }
    });

    // Update progress on audio time update
    if (this.audioElement) {
      this.audioElement.addEventListener("timeupdate", () => {
        this.updateProgress();
      });

      this.audioElement.addEventListener("play", () => {
        this.onPlay();
      });

      this.audioElement.addEventListener("pause", () => {
        this.onPause();
      });

      this.audioElement.addEventListener("ended", () => {
        if (this.repeatMode === "one") {
          this.loadTrack(this.getCurrentTrack(), { autoPlay: true });
          return;
        }

        if (this.repeatMode === "off" && this.currentIndex === this.queue.length - 1) {
          this.onPause();
          return;
        }

        this.nextTrack();
      });
    }
  }

  initializeVisualizers() {
    // Initialize D3 Waveform
    this.waveformVisualizer = new WaveformVisualizer(
      "waveform-d3-viz",
      { theme: this.currentTheme }
    );
    if (typeof this.waveformVisualizer.connectAnalyser === "function") {
      this.waveformVisualizer.connectAnalyser(this.analyser, this.audioContext);
    }

    // Initialize Color Theme Controller
    this.themeController = new ColorThemeController(
      "waveform-d3-viz",
      "theme-control-container"
    );

    // Initialize Radial Spectrum
    this.initRadialSpectrum();

    // Initialize Particle System
    this.initParticleSystem();

    // Start animation loop
    this.startAnimationLoop();
  }

  setupThemeSync() {
    window.addEventListener("soundwave:theme-change", (event) => {
      this.currentTheme = event.detail.key;
      this.syncThemeVisuals();
    });
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

    if (this.radialGuide) {
      this.radialGuide.attr("stroke", border);
    }
    if (this.radialBars) {
      this.radialBars.attr("stroke", accent);
    }
  }

  initRadialSpectrum() {
    const svg = document.getElementById("radial-spectrum");
    const width = 500;
    const height = 500;
    const radius = Math.min(width, height) / 2 - 20;

    svg.setAttribute("viewBox", `${-width / 2} ${-height / 2} ${width} ${height}`);

    this.radialGroup = d3
      .select(svg)
      .append("g")
      .attr("class", "radial-spectrum-group");

    // Background circle
    this.radialGuide = this.radialGroup
      .append("circle")
      .attr("r", radius)
      .attr("fill", "none")
      .attr("stroke", "var(--theater-border)")
      .attr("stroke-width", 1);

    // Create spectrum bars
    const barCount = 64;
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
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const particleCount = 28;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: Math.random() * 2.2 + 0.8,
        opacity: Math.random() * 0.26 + 0.12,
        colorOffset: Math.random() > 0.5 ? "--theater-accent-rgb" : "--theater-art-rgb",
      });
    }

    this.particleSystem = {
      canvas,
      ctx,
      particles,
      frequencyData: new Uint8Array(64),
      draw: () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (this.analyser) {
          this.analyser.getByteFrequencyData(this.particleSystem.frequencyData);
        }

        particles.forEach((p, i) => {
          const frequency = this.particleSystem.frequencyData[i % 64] / 255;
          const scale = 1 + frequency * 0.5;

          // Update position
          p.x += p.vx;
          p.y += p.vy;

          // Bounce off edges
          if (p.x - p.radius * scale < 0 || p.x + p.radius * scale > canvas.width) {
            p.vx *= -1;
          }
          if (p.y - p.radius * scale < 0 || p.y + p.radius * scale > canvas.height) {
            p.vy *= -1;
          }

          // Draw subtle ambient particles using the active theme and album color.
          ctx.fillStyle = `rgb(${this.getCssRgb(p.colorOffset)})`;
          ctx.globalAlpha = p.opacity * (0.35 + frequency * 0.65);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * scale, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.globalAlpha = 1;
      },
    };

    // Start particle animation
    const animateParticles = () => {
      this.particleSystem.draw();
      requestAnimationFrame(animateParticles);
    };
    animateParticles();

    // Handle resize
    window.addEventListener("resize", () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }

  updateRadialBars(frequencyData) {
    if (!this.radialBars) return;

    this.radialBars.attr("y2", (d, i) => {
      const value = frequencyData[i] || 0;
      return (-130 * value) / 255 - 58;
    });
  }

  startAnimationLoop() {
    const animate = () => {
      if (this.analyser) {
        const frequencyData = new Uint8Array(64);
        this.analyser.getByteFrequencyData(frequencyData);
        this.updateRadialBars(frequencyData);
      }

      this.updatePlayButton();
      requestAnimationFrame(() => animate());
    };

    animate();
  }

  updateProgress() {
    if (!this.audioElement) return;

    const percent =
      (this.audioElement.currentTime / this.audioElement.duration) * 100 || 0;
    const progressFill = document.getElementById("progress-fill");
    if (progressFill) {
      progressFill.style.width = percent + "%";
    }

    const currentTime = document.getElementById("current-time");
    const durationTime = document.getElementById("duration-time");

    if (currentTime) {
      currentTime.textContent = this.formatTime(this.audioElement.currentTime);
    }
    if (durationTime) {
      durationTime.textContent = this.formatTime(this.audioElement.duration);
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  updatePlayButton() {
    const playBtn = document.getElementById("theater-play");
    if (!playBtn) return;

    const icon = playBtn.querySelector(".btn-icon");
    if (this.audioElement && !this.audioElement.paused) {
      icon.textContent = "II";
    } else {
      icon.textContent = ">";
    }
  }

  onPlay() {
    if (this.waveformVisualizer) {
      this.waveformVisualizer.play();
    }

    const disc = document.querySelector(".artwork-disc");
    if (disc) {
      disc.classList.remove("paused");
    }
  }

  onPause() {
    if (this.waveformVisualizer) {
      this.waveformVisualizer.pause();
    }

    const disc = document.querySelector(".artwork-disc");
    if (disc) {
      disc.classList.add("paused");
    }
  }

  togglePlayPause() {
    if (this.audioElement) {
      if (this.audioElement.paused) {
        this.playAudio();
      } else {
        this.audioElement.pause();
      }
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

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    const shuffleBtn = document.getElementById("theater-shuffle");
    if (shuffleBtn) {
      shuffleBtn.classList.toggle("active", this.isShuffle);
    }
  }

  toggleRepeat() {
    if (this.repeatMode === "all") {
      this.repeatMode = "one";
    } else if (this.repeatMode === "one") {
      this.repeatMode = "off";
    } else {
      this.repeatMode = "all";
    }

    const repeatBtn = document.getElementById("theater-repeat");
    if (repeatBtn) {
      repeatBtn.classList.toggle("active", this.repeatMode !== "off");
      repeatBtn.title = `Repeat: ${this.repeatMode}`;
    }
  }

  toggleMute() {
    if (this.audioElement) {
      this.audioElement.muted = !this.audioElement.muted;
      this.updateMuteButton();
      return;
      const muteBtn = document.getElementById("theater-mute");
      if (muteBtn) {
        muteBtn.querySelector(".btn-icon").textContent = this.audioElement.muted
          ? "🔇"
          : "🔊";
      }
    }
  }

  setVolume(value) {
    if (this.audioElement) {
      this.audioElement.volume = Math.max(0, Math.min(1, value / 100));
    }
  }

  updateMuteButton() {
    const muteBtn = document.getElementById("theater-mute");
    if (!muteBtn || !this.audioElement) return;

    const icon = muteBtn.querySelector(".btn-icon");
    if (icon) {
      icon.textContent = this.audioElement.muted ? "Mute" : "Vol";
    }
    muteBtn.classList.toggle("active", this.audioElement.muted);
  }

  updateTrackInfo(title, artist, album) {
    const titleEl = document.getElementById("theater-track-title");
    const artistEl = document.getElementById("theater-track-artist");
    const albumEl = document.getElementById("theater-track-album");

    if (titleEl) titleEl.textContent = title || "Now Playing";
    if (artistEl) artistEl.textContent = artist || "Artist";
    if (albumEl) albumEl.textContent = album || "Album";
  }

  setQueue(queue, currentIndex = 0) {
    this.queue = Array.isArray(queue) ? queue.filter((track) => track && track.src) : [];
    this.currentIndex = Math.max(0, Math.min(currentIndex, this.queue.length - 1));
  }

  getCurrentTrack() {
    return this.queue[this.currentIndex] || null;
  }

  async playAudio() {
    if (!this.audioElement) return;

    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

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
    if (volumeSlider) {
      volumeSlider.value = Math.round(this.audioElement.volume * 100);
    }
    this.updateMuteButton();

    this.updateTrackInfo(track.title, track.artist, track.album);
    this.updateAlbumArt(track.albumArt || "img/soundwave.svg");
    this.updateProgress();

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

    if (wasPlaying) {
      this.playAudio();
    }
  }

  updateAlbumArt(src) {
    const img = document.getElementById("theater-album-art");
    if (img) {
      img.src = src;
    }
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
        const secondary = primary.map((value) => Math.min(255, Math.round(value * 1.18)));

        document.documentElement.style.setProperty("--theater-art-rgb", primary.join(", "));
        document.documentElement.style.setProperty("--theater-art-2-rgb", secondary.join(", "));
      } catch (err) {
        console.debug("Could not extract album color:", err.message);
      }
    };
    img.src = src;
  }

  normalizeAlbumRgb(rgb) {
    const average = rgb.reduce((sum, value) => sum + value, 0) / 3;
    if (average < 86) {
      return rgb.map((value) => Math.min(255, Math.round(value * 1.45 + 18)));
    }
    if (average > 198) {
      return rgb.map((value) => Math.max(0, Math.round(value * 0.72)));
    }
    return rgb;
  }

  updateLyrics(lyricsArray) {
    const lyricsContent = document.getElementById("lyrics-content");
    if (!lyricsContent) return;

    if (!Array.isArray(lyricsArray) || lyricsArray.length === 0) {
      lyricsContent.innerHTML = '<p class="lyric-line">No lyrics available</p>';
      return;
    }

    lyricsContent.innerHTML = lyricsArray
      .map((lyric, i) => {
        const timestamp = lyric.timestamp || i;
        return `
        <p class="lyric-line" data-timestamp="${timestamp}">
          ${lyric.text || lyric}
        </p>
      `;
      })
      .join("");
  }

  exitTheater() {
    if (this.waveformVisualizer) {
      this.waveformVisualizer.destroy();
    }

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

// Initialize on page load
window.addEventListener("DOMContentLoaded", () => {
  // Create audio element reference (will be synced with main player)
  const audioElement = document.createElement("audio");
  audioElement.id = "theater-audio";
  audioElement.preload = "metadata";
  audioElement.hidden = true;
  document.body.appendChild(audioElement);

  // Initialize theater
  window.immersiveTheater = new ImmersiveTheater(audioElement);

  // If coming from player.html, sync the audio
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("from") === "player") {
    // Load the track handoff from the in-site player page.
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
  }
});

// Export for external use
window.ImmersiveTheater = ImmersiveTheater;
