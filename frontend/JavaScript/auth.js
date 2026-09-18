async function handleAuth(formId, endpoint, errorId, redirect = "/home.html") {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorEl = document.getElementById(errorId);
    if (errorEl) errorEl.innerHTML = "";

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
        const message = data.error || "Authentication failed";
        const isLogin = endpoint.includes("/login");
        // The backend returns a generic "Invalid credentials" for both a wrong
        // password AND an unknown account, so we must NOT force-redirect people
        // to signup — that traps existing users who simply mistyped a password.
        // Show the error inline, and (for logins) offer an opt-in signup link.
        if (errorEl) {
          errorEl.textContent = message;
          if (isLogin) {
            const signupUrl = endpoint.includes("/api/admin/")
              ? "/admin-signup.html"
              : `/signup.html${window.location.search || ""}`;
            const hint = document.createElement("div");
            hint.className = "auth-error-hint";
            hint.innerHTML = `No account yet? <a href="${signupUrl}">Create one</a>.`;
            errorEl.appendChild(hint);
          }
        }
        return;
      }

      if (window.showAuthOverlay) {
        await window.showAuthOverlay("Logging in...");
      }
      const destination = endpoint.includes("/api/admin/")
        ? "/admin.html"
        : (window.SoundwaveAuthRedirect?.getSafeNext(redirect) || redirect);
      window.location.href = destination;
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
    }
  });
}

handleAuth("loginForm", "/api/auth/login", "loginError");
handleAuth("signupForm", "/api/auth/signup", "signupError");
handleAuth("adminLoginForm", "/api/admin/login", "adminLoginError", "/admin.html");
handleAuth("adminSignupForm", "/api/admin/signup", "adminSignupError", "/admin.html");

document.querySelectorAll("[data-provider]").forEach((button) => {
  button.addEventListener("click", () => {
    const providerInput = document.getElementById("signupProvider");
    if (!providerInput) return;
    providerInput.value = button.dataset.provider || "email";
    document.querySelectorAll("[data-provider]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
  });
});
