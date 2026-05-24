/**
 * Centralized theme system for Soundwave Studio.
 * Presets and custom themes both write to CSS variables, so the app, theater,
 * visualizers, and controls update through the same path.
 */

(function initSoundwaveThemeSystem() {
  const STORAGE_THEME_KEY = "sw_waveform_theme";
  const STORAGE_CUSTOM_KEY = "sw_custom_theme";

  const fontStacks = {
    poppins: '"Poppins", "Segoe UI", sans-serif',
    system: '"Inter", "Segoe UI", Arial, sans-serif',
    rounded: '"Segoe UI", "Trebuchet MS", sans-serif',
    mono: '"JetBrains Mono", "Consolas", monospace',
  };

  const baseThemes = {
    "neon-rose": {
      name: "Soundwave",
      description: "Dark glass with the Soundwave green accent",
      primary: "#3ddc84",
      secondary: "#55b7ff",
      accent: "#a7f3c9",
      background: "#0b0f14",
      surface: "#121821",
      text: "#f4f7fb",
      muted: "#aeb8c5",
      mode: "dark",
      buttonStyle: "pill",
      gradient: "subtle",
      fontFamily: "poppins",
      cardAlpha: 0.72,
      glowIntensity: 0.34,
      borderRadius: 8,
    },
    "deep-ocean": {
      name: "Midnight",
      description: "Cool blue glass with quiet contrast",
      primary: "#6bbcff",
      secondary: "#3ddc84",
      accent: "#b7dcff",
      background: "#07111d",
      surface: "#0d1a28",
      text: "#f4f8ff",
      muted: "#aab9ca",
      mode: "dark",
      buttonStyle: "pill",
      gradient: "subtle",
      fontFamily: "poppins",
      cardAlpha: 0.74,
      glowIntensity: 0.28,
      borderRadius: 8,
    },
    "sunset-gold": {
      name: "Amber",
      description: "Warm amber highlights on deep charcoal",
      primary: "#f3b65f",
      secondary: "#3ddc84",
      accent: "#ffe1a8",
      background: "#12100d",
      surface: "#1a1711",
      text: "#fff7ec",
      muted: "#c8bca8",
      mode: "dark",
      buttonStyle: "pill",
      gradient: "subtle",
      fontFamily: "poppins",
      cardAlpha: 0.75,
      glowIntensity: 0.24,
      borderRadius: 8,
    },
    "cosmic-purple": {
      name: "Violet",
      description: "Muted violet depth with soft highlights",
      primary: "#a78bfa",
      secondary: "#3ddc84",
      accent: "#ddd6fe",
      background: "#0e0b18",
      surface: "#151124",
      text: "#f7f4ff",
      muted: "#b9b1ca",
      mode: "dark",
      buttonStyle: "pill",
      gradient: "subtle",
      fontFamily: "poppins",
      cardAlpha: 0.74,
      glowIntensity: 0.28,
      borderRadius: 8,
    },
    "forest-green": {
      name: "Forest",
      description: "Organic green with restrained depth",
      primary: "#55d68f",
      secondary: "#9fca7a",
      accent: "#caf7df",
      background: "#07140e",
      surface: "#0d1d15",
      text: "#f3fff8",
      muted: "#adbaaf",
      mode: "dark",
      buttonStyle: "pill",
      gradient: "subtle",
      fontFamily: "poppins",
      cardAlpha: 0.74,
      glowIntensity: 0.28,
      borderRadius: 8,
    },
  };

  let liveCustomTheme = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function hexToRgb(hex) {
    const clean = String(hex || "").replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }

  function rgbString(hex, fallback = "#3ddc84") {
    const rgb = hexToRgb(hex) || hexToRgb(fallback);
    return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  }

  function rgba(hex, alpha, fallback = "#121821") {
    return `rgba(${rgbString(hex, fallback)}, ${clamp(alpha, 0, 1).toFixed(2)})`;
  }

  function shade(hex, amount) {
    const rgb = hexToRgb(hex) || hexToRgb("#3ddc84");
    const shift = Math.round(255 * amount);
    const channel = (value) => Math.max(0, Math.min(255, value + shift));
    return `#${[channel(rgb.r), channel(rgb.g), channel(rgb.b)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function luminance(hex) {
    const rgb = hexToRgb(hex) || hexToRgb("#0b0f14");
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }

  function contrastRatio(colorA, colorB) {
    const lumA = luminance(colorA);
    const lumB = luminance(colorB);
    const light = Math.max(lumA, lumB);
    const dark = Math.min(lumA, lumB);
    return (light + 0.05) / (dark + 0.05);
  }

  function readableOn(background, preferred, fallbackLight = "#f4f7fb", fallbackDark = "#07130d") {
    if (preferred && contrastRatio(background, preferred) >= 4.5) return preferred;
    return contrastRatio(background, fallbackLight) >= contrastRatio(background, fallbackDark)
      ? fallbackLight
      : fallbackDark;
  }

  function mix(hexA, hexB, weight = 0.5) {
    const a = hexToRgb(hexA) || hexToRgb("#0b0f14");
    const b = hexToRgb(hexB) || hexToRgb("#f4f7fb");
    const channel = (valueA, valueB) => Math.round(valueA * (1 - weight) + valueB * weight);
    return `#${[channel(a.r, b.r), channel(a.g, b.g), channel(a.b, b.b)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function normalizeCustomTheme(raw = {}) {
    const fallback = baseThemes["neon-rose"];
    const mode = raw.mode === "light" ? "light" : "dark";
    return {
      name: raw.name || "Custom",
      description: "Saved custom theme",
      primary: raw.primary || fallback.primary,
      secondary: raw.secondary || fallback.secondary,
      accent: raw.accent || fallback.accent,
      background: raw.background || (mode === "light" ? "#f5f7fb" : fallback.background),
      surface: raw.surface || (mode === "light" ? "#ffffff" : fallback.surface),
      text: raw.text || (mode === "light" ? "#121826" : fallback.text),
      muted: raw.muted || (mode === "light" ? "#5f6b7a" : fallback.muted),
      mode,
      buttonStyle: ["pill", "soft", "sharp", "outline"].includes(raw.buttonStyle)
        ? raw.buttonStyle
        : "pill",
      gradient: ["none", "subtle", "vibrant"].includes(raw.gradient) ? raw.gradient : "subtle",
      fontFamily: fontStacks[raw.fontFamily] ? raw.fontFamily : "poppins",
      cardAlpha: clamp(raw.cardAlpha ?? fallback.cardAlpha, 0.35, 0.96),
      glowIntensity: clamp(raw.glowIntensity ?? fallback.glowIntensity, 0, 0.85),
      borderRadius: clamp(raw.borderRadius ?? fallback.borderRadius, 4, 28),
    };
  }

  function loadCustomTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_KEY) || "null");
      return saved ? normalizeCustomTheme(saved) : null;
    } catch {
      return null;
    }
  }

  function hydrateTheme(theme) {
    const normalized = normalizeCustomTheme(theme);
    const primaryRgb = rgbString(normalized.primary);
    const secondaryRgb = rgbString(normalized.secondary, normalized.primary);
    const accentRgb = rgbString(normalized.accent, normalized.primary);
    const bgRgb = rgbString(normalized.background);
    const surfaceRgb = rgbString(normalized.surface, normalized.background);
    const borderAlpha = normalized.mode === "light" ? 0.18 : 0.13;
    const pageText = readableOn(normalized.background, normalized.text);
    const panelText = readableOn(normalized.surface, normalized.text);
    const pageMuted = mix(normalized.background, pageText, normalized.mode === "light" ? 0.56 : 0.66);
    const panelMuted = mix(normalized.surface, panelText, normalized.mode === "light" ? 0.52 : 0.62);
    const listSurface = normalized.mode === "light"
      ? mix(normalized.surface, normalized.background, 0.28)
      : mix(normalized.background, normalized.surface, 0.38);
    const listText = readableOn(listSurface, normalized.text);
    const listMuted = mix(listSurface, listText, normalized.mode === "light" ? 0.48 : 0.58);
    const inputSurface = normalized.mode === "light"
      ? mix(normalized.surface, "#000000", 0.04)
      : mix(normalized.background, normalized.surface, 0.52);
    const inputText = readableOn(inputSurface, normalized.text);
    const inputMuted = mix(inputSurface, inputText, 0.52);
    const buttonRadius =
      normalized.buttonStyle === "sharp"
        ? `${Math.max(4, normalized.borderRadius * 0.55)}px`
        : normalized.buttonStyle === "soft"
          ? `${Math.max(10, normalized.borderRadius + 6)}px`
          : "999px";
    const buttonBg =
      normalized.buttonStyle === "outline"
        ? "transparent"
        : normalized.gradient === "none"
          ? normalized.primary
          : `linear-gradient(135deg, ${normalized.primary}, ${normalized.secondary})`;
    const pageGradient =
      normalized.gradient === "none"
        ? normalized.background
        : normalized.gradient === "vibrant"
          ? `radial-gradient(circle at top left, rgba(${primaryRgb}, 0.32), transparent 34%), radial-gradient(circle at top right, rgba(${secondaryRgb}, 0.26), transparent 36%), ${normalized.background}`
          : `radial-gradient(circle at top, rgba(${primaryRgb}, 0.16), ${normalized.background} 58%)`;

    return {
      ...normalized,
      primaryRgb,
      secondaryRgb,
      accentRgb,
      bgRgb,
      surfaceRgb,
      primaryDark: shade(normalized.primary, -0.16),
      pageText,
      pageMuted,
      panelText,
      panelMuted,
      listSurface,
      listText,
      listMuted,
      inputSurface,
      inputText,
      inputMuted,
      panel: rgba(normalized.surface, normalized.cardAlpha),
      panelStrong: rgba(normalized.background, Math.min(0.92, normalized.cardAlpha + 0.12)),
      border: `rgba(${accentRgb}, ${borderAlpha})`,
      shadow: `0 22px 60px rgba(0, 0, 0, ${normalized.mode === "light" ? 0.14 : 0.42})`,
      glow: `0 18px ${Math.round(44 * normalized.glowIntensity)}px rgba(${primaryRgb}, ${Math.max(0.08, normalized.glowIntensity * 0.42).toFixed(2)})`,
      buttonRadius,
      buttonBg,
      buttonText: normalized.buttonStyle === "outline"
        ? readableOn(normalized.background, normalized.text)
        : readableOn(normalized.primary, "#07130d"),
      buttonBorder:
        normalized.buttonStyle === "outline" ? `1px solid rgba(${primaryRgb}, 0.45)` : "1px solid transparent",
      fontStack: fontStacks[normalized.fontFamily],
      pageGradient,
    };
  }

  function getTheme(themeName) {
    if (themeName === "custom") {
      return hydrateTheme(liveCustomTheme || loadCustomTheme() || baseThemes["neon-rose"]);
    }
    return hydrateTheme(baseThemes[themeName] || baseThemes["neon-rose"]);
  }

  function normalizeTheme(themeName) {
    if (themeName === "custom" && (liveCustomTheme || loadCustomTheme())) return "custom";
    return baseThemes[themeName] ? themeName : "neon-rose";
  }

  function setVariables(target, variables) {
    if (!target) return;
    Object.entries(variables).forEach(([name, value]) => {
      target.style.setProperty(name, value);
    });
  }

  function applyTheme(themeName, root = document.documentElement) {
    const key = normalizeTheme(themeName);
    const theme = getTheme(key);
    const variables = {
      "--bg": theme.background,
      "--bg-soft": theme.surface,
      "--panel": theme.panel,
      "--accent": theme.primary,
      "--accent-dark": theme.primaryDark,
      "--secondary-accent": theme.secondary,
      "--text": theme.panelText,
      "--muted": theme.panelMuted,
      "--page-text": theme.pageText,
      "--page-muted": theme.pageMuted,
      "--panel-text": theme.panelText,
      "--panel-muted": theme.panelMuted,
      "--list-bg": theme.listSurface,
      "--list-text": theme.listText,
      "--list-muted": theme.listMuted,
      "--list-border": `rgba(${theme.accentRgb}, ${theme.mode === "light" ? 0.2 : 0.16})`,
      "--list-hover-bg": `rgba(${theme.primaryRgb}, ${theme.mode === "light" ? 0.12 : 0.14})`,
      "--input-bg": theme.inputSurface,
      "--input-text": theme.inputText,
      "--input-placeholder": theme.inputMuted,
      "--nav-text": theme.pageText,
      "--nav-muted": theme.pageMuted,
      "--border": theme.border,
      "--shadow": theme.shadow,
      "--app-glow": theme.glow,
      "--app-bg-gradient": theme.pageGradient,
      "--theme-gradient": `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
      "--accent-rgb": theme.primaryRgb,
      "--secondary-rgb": theme.secondaryRgb,
      "--bg-rgb": theme.bgRgb,
      "--surface-rgb": theme.surfaceRgb,
      "--card-alpha": String(theme.cardAlpha),
      "--glow-strength": String(theme.glowIntensity),
      "--radius": `${theme.borderRadius}px`,
      "--button-radius": theme.buttonRadius,
      "--button-bg": theme.buttonBg,
      "--button-text": theme.buttonText,
      "--button-border": theme.buttonBorder,
      "--font-family": theme.fontStack,
      "--theater-bg": theme.background,
      "--theater-bg-soft": theme.surface,
      "--theater-panel": theme.panel,
      "--theater-panel-strong": theme.panelStrong,
      "--theater-border": theme.border,
      "--theater-text": theme.panelText,
      "--theater-muted": theme.panelMuted,
      "--theater-accent": theme.primary,
      "--theater-accent-2": theme.secondary,
      "--theater-highlight": theme.accent,
      "--theater-accent-rgb": theme.primaryRgb,
      "--theater-accent-2-rgb": theme.secondaryRgb,
      "--theater-radius": `${theme.borderRadius}px`,
      "--theater-shadow": theme.shadow,
      "--theater-glow": theme.glow,
    };

    setVariables(root, variables);
    setVariables(document.body, variables);

    if (document.body) {
      document.body.classList.remove("theme-light");
      document.body.dataset.themeMode = theme.mode;
      document.body.dataset.themeName = key;
    }
    root.dataset.theaterTheme = key;

    window.dispatchEvent(
      new CustomEvent("soundwave:theme-change", {
        detail: { key, theme },
      })
    );

    return key;
  }

  function previewCustomTheme(config) {
    liveCustomTheme = normalizeCustomTheme(config);
    return applyTheme("custom");
  }

  function saveCustomTheme(config) {
    const customTheme = normalizeCustomTheme(config);
    liveCustomTheme = customTheme;
    localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(customTheme));
    localStorage.setItem(STORAGE_THEME_KEY, "custom");
    localStorage.setItem("sw_theme", customTheme.mode);
    return applyTheme("custom");
  }

  function setMode(mode) {
    const targetMode = mode === "light" ? "light" : "dark";
    const activeTheme = getTheme(localStorage.getItem(STORAGE_THEME_KEY) || "neon-rose");
    return saveCustomTheme({
      ...activeTheme,
      mode: targetMode,
      background: targetMode === "light" ? "#f5f7fb" : "#0b0f14",
      surface: targetMode === "light" ? "#ffffff" : "#121821",
      text: targetMode === "light" ? "#121826" : "#f4f7fb",
      muted: targetMode === "light" ? "#5f6b7a" : "#aeb8c5",
      cardAlpha: targetMode === "light" ? 0.92 : 0.72,
    });
  }

  function resetCustomTheme() {
    liveCustomTheme = null;
    localStorage.removeItem(STORAGE_CUSTOM_KEY);
    localStorage.setItem(STORAGE_THEME_KEY, "neon-rose");
    localStorage.setItem("sw_theme", "dark");
    return applyTheme("neon-rose");
  }

  function getVisualizerThemes() {
    const entries = Object.entries(baseThemes).map(([key, theme]) => {
      const hydrated = hydrateTheme(theme);
      return [
        key,
        {
          primary: hydrated.primary,
          secondary: hydrated.secondary,
          accent: hydrated.accent,
          background: "transparent",
        },
      ];
    });

    if (liveCustomTheme || loadCustomTheme()) {
      const custom = getTheme("custom");
      entries.push([
        "custom",
        {
          primary: custom.primary,
          secondary: custom.secondary,
          accent: custom.accent,
          background: "transparent",
        },
      ]);
    }

    return Object.fromEntries(entries);
  }

  function applyStoredTheme() {
    const storedTheme = localStorage.getItem(STORAGE_THEME_KEY);
    const legacyMode = localStorage.getItem("sw_theme");
    if (!storedTheme && legacyMode === "light") {
      const lightTheme = {
        ...baseThemes["neon-rose"],
        mode: "light",
        background: "#f5f7fb",
        surface: "#ffffff",
        text: "#121826",
        muted: "#5f6b7a",
        cardAlpha: 0.92,
      };
      liveCustomTheme = lightTheme;
      applyTheme("custom");
      return;
    }
    applyTheme(storedTheme || "neon-rose");
  }

  window.SoundwaveThemeSystem = {
    themes: baseThemes,
    fontStacks,
    storageThemeKey: STORAGE_THEME_KEY,
    storageCustomKey: STORAGE_CUSTOM_KEY,
    normalizeTheme,
    getTheme,
    applyTheme,
    previewCustomTheme,
    saveCustomTheme,
    setMode,
    resetCustomTheme,
    loadCustomTheme,
    getVisualizerThemes,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyStoredTheme, { once: true });
  } else {
    applyStoredTheme();
  }
})();

class ColorThemeController {
  constructor(visualizerId, controlContainerId, options = {}) {
    this.visualizer = window.WaveformVisualizer?.visualizers?.[visualizerId] || null;
    this.controlContainer = document.getElementById(controlContainerId);
    this.storageKey = options.storageKey || window.SoundwaveThemeSystem.storageThemeKey;
    this.currentTheme = window.SoundwaveThemeSystem.normalizeTheme(
      localStorage.getItem(this.storageKey) || options.defaultTheme || "neon-rose"
    );
    this.themes = window.SoundwaveThemeSystem.themes;
    this.customDraft = this.getInitialCustomDraft();
    this.customizerOpen = false;

    this.initUI();
    this.setTheme(this.currentTheme, { persist: false });
  }

  getInitialCustomDraft(sourceTheme = this.currentTheme, preferSaved = true) {
    const saved = window.SoundwaveThemeSystem.loadCustomTheme();
    const base = preferSaved && saved ? saved : window.SoundwaveThemeSystem.getTheme(sourceTheme);
    return {
      primary: base.primary,
      secondary: base.secondary,
      accent: base.accent,
      background: base.background,
      surface: base.surface,
      text: base.text,
      muted: base.muted,
      mode: base.mode,
      buttonStyle: base.buttonStyle,
      gradient: base.gradient,
      fontFamily: base.fontFamily,
      cardAlpha: base.cardAlpha,
      glowIntensity: base.glowIntensity,
      borderRadius: base.borderRadius,
    };
  }

  initUI() {
    if (!this.controlContainer) return;

    document.getElementById("themeCustomizerPanel")?.remove();

    this.controlContainer.innerHTML = `
      <div class="theme-controller" aria-label="Theater theme">
        <div class="theme-header">
          <h3>Theme</h3>
          <span class="theme-label" id="themeLabel"></span>
        </div>
        <div class="theme-grid" id="themeGrid"></div>
        <div class="theme-actions">
          <button type="button" class="theme-customize-btn" id="themeCustomizeBtn">Customize Theme</button>
        </div>
      </div>
      <div class="theme-customizer-panel" id="themeCustomizerPanel" hidden>
        <div class="theme-customizer-head">
          <div>
            <h3>Customize Theme</h3>
            <p>Live preview applies instantly.</p>
          </div>
          <button type="button" class="theme-panel-close" id="themePanelClose" aria-label="Close theme editor">&times;</button>
        </div>
        <div class="theme-preview-card">
          <div class="theme-preview-art"></div>
          <div>
            <strong>Soundwave Studio</strong>
            <span>Premium music controls</span>
            <div class="theme-preview-bars"><i></i><i></i><i></i><i></i></div>
          </div>
          <button type="button">Play</button>
        </div>
        <div class="theme-mode-row" role="group" aria-label="Theme mode">
          <button type="button" class="theme-mode-btn" data-mode="dark">Dark</button>
          <button type="button" class="theme-mode-btn" data-mode="light">Light</button>
        </div>
        <div class="theme-custom-grid">
          ${this.colorField("primary", "Primary Color")}
          ${this.colorField("secondary", "Secondary Color")}
          ${this.colorField("accent", "Accent Color")}
          ${this.colorField("background", "Background")}
          ${this.colorField("surface", "Card Color")}
          ${this.colorField("text", "Text Color")}
          ${this.selectField("buttonStyle", "Button Style", [
            ["pill", "Pill"],
            ["soft", "Soft"],
            ["sharp", "Sharp"],
            ["outline", "Outline"],
          ])}
          ${this.selectField("gradient", "Gradients", [
            ["subtle", "Subtle"],
            ["vibrant", "Vibrant"],
            ["none", "None"],
          ])}
          ${this.selectField("fontFamily", "Font", [
            ["poppins", "Poppins"],
            ["system", "System"],
            ["rounded", "Rounded"],
            ["mono", "Mono"],
          ])}
          ${this.rangeField("cardAlpha", "Card Transparency", 0.35, 0.96, 0.01)}
          ${this.rangeField("glowIntensity", "Glow Intensity", 0, 0.85, 0.01)}
          ${this.rangeField("borderRadius", "Border Radius", 4, 28, 1)}
        </div>
        <div class="theme-custom-actions">
          <button type="button" class="theme-save-btn" id="saveCustomTheme">Save Custom Theme</button>
          <button type="button" class="theme-reset-btn" id="resetCustomTheme">Reset Default</button>
        </div>
      </div>
    `;

    this.customizerPanel = this.controlContainer.querySelector("#themeCustomizerPanel");
    if (this.customizerPanel) {
      document.body.appendChild(this.customizerPanel);
    }

    this.renderThemeButtons();
    this.bindCustomizer();
    this.syncCustomizerInputs();
  }

  getCustomizerPanel() {
    return this.customizerPanel || document.getElementById("themeCustomizerPanel");
  }

  colorField(name, label) {
    return `
      <label class="theme-field">
        <span>${label}</span>
        <input type="color" name="${name}" value="${this.customDraft[name]}">
      </label>
    `;
  }

  rangeField(name, label, min, max, step) {
    return `
      <label class="theme-field">
        <span>${label} <output data-output-for="${name}"></output></span>
        <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${this.customDraft[name]}">
      </label>
    `;
  }

  selectField(name, label, options) {
    const optionMarkup = options
      .map(([value, text]) => `<option value="${value}">${text}</option>`)
      .join("");
    return `
      <label class="theme-field">
        <span>${label}</span>
        <select name="${name}">${optionMarkup}</select>
      </label>
    `;
  }

  getThemeEntries() {
    const entries = Object.entries(this.themes);
    if (window.SoundwaveThemeSystem.loadCustomTheme()) {
      entries.push(["custom", window.SoundwaveThemeSystem.getTheme("custom")]);
    }
    return entries;
  }

  renderThemeButtons() {
    const themeGrid = this.controlContainer?.querySelector("#themeGrid");
    if (!themeGrid) return;
    themeGrid.innerHTML = "";

    this.getThemeEntries().forEach(([key, theme]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-btn";
      btn.dataset.theme = key;
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML = `
        <span class="theme-swatch" style="--swatch-a: ${theme.primary}; --swatch-b: ${theme.secondary};"></span>
        <span class="theme-name">${theme.name}</span>
      `;
      btn.title = theme.description;
      btn.addEventListener("click", () => this.setTheme(key));
      themeGrid.appendChild(btn);
    });

    this.updateUI();
  }

  bindCustomizer() {
    const panel = this.getCustomizerPanel();
    const toggle = this.controlContainer.querySelector("#themeCustomizeBtn");
    const close = panel?.querySelector("#themePanelClose");
    const save = panel?.querySelector("#saveCustomTheme");
    const reset = panel?.querySelector("#resetCustomTheme");

    toggle?.addEventListener("click", () => this.toggleCustomizer());
    close?.addEventListener("click", () => this.toggleCustomizer(false));

    panel?.querySelectorAll("input, select").forEach((field) => {
      field.addEventListener("input", () => this.updateCustomDraftFromInputs());
      field.addEventListener("change", () => this.updateCustomDraftFromInputs());
    });

    panel?.querySelectorAll(".theme-mode-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        this.customDraft.mode = mode;
        if (mode === "light") {
          this.customDraft.background = "#f5f7fb";
          this.customDraft.surface = "#ffffff";
          this.customDraft.text = "#121826";
          this.customDraft.muted = "#5f6b7a";
          this.customDraft.cardAlpha = 0.92;
        } else {
          this.customDraft.background = "#0b0f14";
          this.customDraft.surface = "#121821";
          this.customDraft.text = "#f4f7fb";
          this.customDraft.muted = "#aeb8c5";
          this.customDraft.cardAlpha = 0.72;
        }
        this.syncCustomizerInputs();
        this.previewCustomTheme();
      });
    });

    save?.addEventListener("click", () => {
      this.updateCustomDraftFromInputs({ preview: false });
      const key = window.SoundwaveThemeSystem.saveCustomTheme(this.customDraft);
      this.currentTheme = key;
      this.renderThemeButtons();
      this.updateUI();
    });

    reset?.addEventListener("click", () => {
      const key = window.SoundwaveThemeSystem.resetCustomTheme();
      this.currentTheme = key;
      this.customDraft = this.getInitialCustomDraft();
      this.syncCustomizerInputs();
      this.renderThemeButtons();
      this.setTheme("neon-rose");
    });
  }

  toggleCustomizer(forceOpen) {
    const panel = this.getCustomizerPanel();
    const toggle = this.controlContainer.querySelector("#themeCustomizeBtn");
    this.customizerOpen = typeof forceOpen === "boolean" ? forceOpen : !this.customizerOpen;
    if (panel) panel.hidden = !this.customizerOpen;
    document.body.classList.toggle("theme-customizer-open", this.customizerOpen);
    toggle?.setAttribute("aria-expanded", String(this.customizerOpen));
    if (this.customizerOpen) {
      this.syncCustomizerInputs();
    }
  }

  updateCustomDraftFromInputs(options = {}) {
    const panel = this.getCustomizerPanel();
    if (!panel) return;
    panel.querySelectorAll("input, select").forEach((field) => {
      const value = field.type === "range" ? Number(field.value) : field.value;
      this.customDraft[field.name] = value;
    });
    this.syncOutputs();
    if (options.preview !== false) {
      this.previewCustomTheme();
    }
  }

  syncCustomizerInputs() {
    const panel = this.getCustomizerPanel();
    if (!panel) return;
    panel.querySelectorAll("input, select").forEach((field) => {
      if (this.customDraft[field.name] !== undefined) {
        field.value = this.customDraft[field.name];
      }
    });
    panel.querySelectorAll(".theme-mode-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === this.customDraft.mode);
    });
    this.syncOutputs();
  }

  syncOutputs() {
    this.getCustomizerPanel()?.querySelectorAll("[data-output-for]").forEach((output) => {
      const value = this.customDraft[output.dataset.outputFor];
      output.textContent = output.dataset.outputFor === "borderRadius" ? `${value}px` : Number(value).toFixed(2);
    });
  }

  previewCustomTheme() {
    const key = window.SoundwaveThemeSystem.previewCustomTheme(this.customDraft);
    this.currentTheme = key;
    if (this.visualizer?.setTheme) {
      this.visualizer.setTheme(key);
    }
    this.updateUI();
  }

  setTheme(themeName, options = {}) {
    const key = window.SoundwaveThemeSystem.applyTheme(themeName);
    this.currentTheme = key;

    if (key !== "custom") {
      this.customDraft = this.getInitialCustomDraft(key, false);
      this.syncCustomizerInputs();
    }

    if (this.visualizer?.setTheme) {
      this.visualizer.setTheme(key);
    }

    this.updateUI();

    if (options.persist !== false) {
      localStorage.setItem(this.storageKey, key);
      localStorage.setItem("sw_theme", window.SoundwaveThemeSystem.getTheme(key).mode);
    }
  }

  updateUI() {
    const theme = window.SoundwaveThemeSystem.getTheme(this.currentTheme);
    this.controlContainer?.querySelectorAll(".theme-btn").forEach((btn) => {
      const isActive = btn.dataset.theme === this.currentTheme;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });

    const label = this.controlContainer?.querySelector("#themeLabel");
    if (label) label.textContent = theme.name;
  }
}

window.ColorThemeController = ColorThemeController;

if (window.WaveformVisualizer && !window.WaveformVisualizer.visualizers) {
  const OriginalVisualizer = window.WaveformVisualizer;
  function TrackedVisualizer(...args) {
    const instance = new OriginalVisualizer(...args);
    TrackedVisualizer.visualizers[args[0]] = instance;
    return instance;
  }

  TrackedVisualizer.prototype = OriginalVisualizer.prototype;
  Object.setPrototypeOf(TrackedVisualizer, OriginalVisualizer);
  TrackedVisualizer.visualizers = {};
  window.WaveformVisualizer = TrackedVisualizer;
}
