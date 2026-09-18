(function () {
  try {
    const storedTheme = localStorage.getItem("sw_theme");
    const customTheme = JSON.parse(localStorage.getItem("sw_custom_theme") || "null");
    const isLight = storedTheme === "light" || customTheme?.mode === "light";
    if (isLight) document.documentElement.dataset.themeMode = "light";
  } catch (error) {
    // Theme loading can safely fall back to the dark defaults.
  }
})();
