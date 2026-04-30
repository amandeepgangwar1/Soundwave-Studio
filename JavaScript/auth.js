async function handleAuth(formId, endpoint, errorId, redirect = "/home.html") {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorEl = document.getElementById(errorId);
    if (errorEl) errorEl.textContent = "";

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Authentication failed");
      }

      if (window.showAuthOverlay) {
        await window.showAuthOverlay("Logging in...");
      }
      window.location.href = redirect;
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
    }
  });
}

handleAuth("loginForm", "/api/auth/login", "loginError");
handleAuth("signupForm", "/api/auth/signup", "signupError");
handleAuth("adminLoginForm", "/api/admin/login", "adminLoginError", "/admin.html");
handleAuth("adminSignupForm", "/api/admin/signup", "adminSignupError", "/admin.html");
