/**
 * WaveformVisualizer - D3-powered real-time audio visualization
 * Features: Live waveform sync, frequency analysis, theme support
 */

class WaveformVisualizer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container ${containerId} not found`);
      return;
    }

    this.width = options.width || this.container.clientWidth || 800;
    this.height = options.height || this.container.clientHeight || 200;
    this.barCount = options.barCount || 64;
    this.theme = options.theme || "neon-rose";
    this.isPlaying = false;
    this.volume = 1;
    this.frequencyData = new Uint8Array(this.barCount);
    this.audioContext = null;
    this.analyser = null;
    this.animationId = null;

    this.themes = this.getThemes();

    this.initSVG();
  }

  initSVG() {
    // Clear existing content
    this.container.innerHTML = "";

    // Create SVG
    this.svg = d3
      .select(`#${this.container.id}`)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height)
      .style("background", this.themes[this.theme]?.background || "transparent");

    // Add defs for gradients
    const defs = this.svg.append("defs");
    this.createGradients(defs);

    // Create bars group
    this.barsGroup = this.svg
      .append("g")
      .attr("class", "waveform-bars")
      .attr("transform", `translate(0, ${this.height / 2})`);

    // Initialize bars
    this.updateBars([]);
  }

  createGradients(defs) {
    const theme = this.themes[this.theme] || this.themes["neon-rose"];

    // Primary gradient
    const primaryGrad = defs
      .append("linearGradient")
      .attr("id", "primary-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    primaryGrad
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", theme.primary)
      .attr("stop-opacity", 0.92);

    primaryGrad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", theme.secondary)
      .attr("stop-opacity", 0.48);

    // Secondary gradient (for mirror)
    const secondaryGrad = defs
      .append("linearGradient")
      .attr("id", "secondary-gradient")
      .attr("x1", "0%")
      .attr("y1", "100%")
      .attr("x2", "0%")
      .attr("y2", "0%");

    secondaryGrad
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", theme.secondary)
      .attr("stop-opacity", 0.42);

    secondaryGrad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", theme.primary)
      .attr("stop-opacity", 0.86);

    // Glow filter
    const filter = defs
      .append("filter")
      .attr("id", "glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");

    filter
      .append("feGaussianBlur")
      .attr("stdDeviation", 1.2)
      .attr("result", "coloredBlur");

    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");
  }

  updateBars(data) {
    const barWidth = this.width / this.barCount;
    const maxHeight = this.height / 2 - 5;

    // Bind data
    const bars = this.barsGroup
      .selectAll(".bar")
      .data(data, (d, i) => i);

    // Enter & Update
    bars
      .enter()
      .append("g")
      .attr("class", "bar")
      .attr("transform", (d, i) => `translate(${i * barWidth}, 0)`)
      .merge(bars)
      .attr("transform", (d, i) => `translate(${i * barWidth}, 0)`)
      .each(function (d, i) {
        const barGroup = d3.select(this);

        // Top bar (positive)
        const topBar = barGroup
          .selectAll(".top-rect")
          .data([d])
          .join("rect")
          .attr("class", "top-rect")
          .attr("x", 1)
          .attr("y", -maxHeight)
          .attr("width", barWidth - 2)
          .attr("height", 0)
          .attr("fill", "url(#primary-gradient)")
          .attr("filter", "url(#glow)")
          .transition()
          .duration(100)
          .attr("height", (d * maxHeight) / 255);

        // Bottom bar (mirror - negative)
        const bottomBar = barGroup
          .selectAll(".bottom-rect")
          .data([d])
          .join("rect")
          .attr("class", "bottom-rect")
          .attr("x", 1)
          .attr("y", 0)
          .attr("width", barWidth - 2)
          .attr("height", 0)
          .attr("fill", "url(#secondary-gradient)")
          .attr("filter", "url(#glow)")
          .transition()
          .duration(100)
          .attr("height", (d * maxHeight) / 255);
      });

    // Exit
    bars.exit().remove();
  }

  setTheme(themeName) {
    this.themes = this.getThemes();
    if (this.themes[themeName]) {
      this.theme = themeName;
      this.initSVG();
      this.startAnimation();
    }
  }

  getThemes() {
    if (window.SoundwaveThemeSystem?.getVisualizerThemes) {
      return window.SoundwaveThemeSystem.getVisualizerThemes();
    }

    return {
      "neon-rose": {
        primary: "#3ddc84",
        secondary: "#55b7ff",
        accent: "#a7f3c9",
        background: "transparent",
      },
      "deep-ocean": {
        primary: "#6bbcff",
        secondary: "#3ddc84",
        accent: "#b7dcff",
        background: "transparent",
      },
      "sunset-gold": {
        primary: "#f3b65f",
        secondary: "#3ddc84",
        accent: "#ffe1a8",
        background: "transparent",
      },
      "cosmic-purple": {
        primary: "#a78bfa",
        secondary: "#3ddc84",
        accent: "#ddd6fe",
        background: "transparent",
      },
      "forest-green": {
        primary: "#55d68f",
        secondary: "#9fca7a",
        accent: "#caf7df",
        background: "transparent",
      },
    };
  }

  connectAudioContext(audioElement, audioContext) {
    this.audioElement = audioElement;
    this.audioContext = audioContext;

    if (!this.analyser) {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
    }

    // Connect audio source if not already connected
    if (!this.source) {
      try {
        this.source = this.audioContext.createMediaElementAudioSource(
          audioElement
        );
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
      } catch (e) {
        console.warn("Audio source already connected:", e.message);
      }
    }
  }

  connectAnalyser(analyser, audioContext = null) {
    this.analyser = analyser;
    this.audioContext = audioContext || analyser.context || null;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  startAnimation() {
    if (this.animationId) cancelAnimationFrame(this.animationId);

    const animate = () => {
      if (this.analyser && this.isPlaying) {
        this.analyser.getByteFrequencyData(this.frequencyData);
        const smoothedData = Array.from({ length: this.barCount }, (_, i) => {
          const sourceIndex = Math.floor((i / this.barCount) * this.frequencyData.length);
          const val = this.frequencyData[sourceIndex] || 0;
          // Boost mid-range frequencies
          const freq = i / this.barCount;
          const boost = Math.sin(freq * Math.PI) * 0.3 + 0.7;
          return Math.floor(val * boost);
        });
        this.updateBars(smoothedData);
      } else {
        // Show ambient wave when not playing
        const ambientData = Array.from({ length: this.barCount }, (_, i) => {
          return Math.sin((i / this.barCount + Date.now() / 2000) * Math.PI * 2) *
            40 +
            50;
        });
        this.updateBars(ambientData);
      }
      this.animationId = requestAnimationFrame(animate);
    };

    animate();
  }

  play() {
    this.isPlaying = true;
    if (!this.animationId) this.startAnimation();
  }

  pause() {
    this.isPlaying = false;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value / 100));
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}

// Export for use
window.WaveformVisualizer = WaveformVisualizer;
