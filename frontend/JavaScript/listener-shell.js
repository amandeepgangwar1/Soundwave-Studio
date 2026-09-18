async function requireListenerAuth() {
  const res = await fetch("/api/me", { credentials: "include" });
  if (!res.ok) {
    window.location.href = window.SoundwaveAuthRedirect?.getLoginUrl() || "../login.html";
    return false;
  }
  return true;
}

async function logoutListener() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  if (window.showAuthOverlay) {
    await window.showAuthOverlay("Logging out...");
  }
  window.location.href = "../login.html";
}

(async function initListenerShell() {
  const authenticated = await requireListenerAuth();
  if (!authenticated) return;

  const logoutButton = document.getElementById("logoutBtn");
  if (logoutButton) logoutButton.addEventListener("click", logoutListener);
})();
