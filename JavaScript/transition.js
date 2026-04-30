(function () {
  function ensureOverlay() {
    let overlay = document.querySelector(".auth-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "auth-overlay";
      overlay.innerHTML = `
        <div class="auth-overlay-card">
          <div class="auth-spinner"></div>
          <div class="auth-title" id="authOverlayTitle">Processing...</div>
          <div class="auth-subtitle">Please wait a moment</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  window.showAuthOverlay = function (message) {
    const overlay = ensureOverlay();
    const title = overlay.querySelector("#authOverlayTitle");
    if (title) title.textContent = message || "Processing...";
    overlay.classList.add("active");
    return new Promise((resolve) => {
      setTimeout(() => {
        overlay.classList.remove("active");
        resolve();
      }, 3000);
    });
  };
})();
