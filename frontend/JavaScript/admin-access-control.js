/**
 * Admin Access Control Script
 * Hides admin section from regular users
 * Only shows admin links if user is authenticated as an admin
 */

(async function () {
  // Check if user is admin
  async function isUserAdmin() {
    try {
      const res = await fetch("/api/admin/check", {
        credentials: "include"
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.isAdmin === true;
    } catch (err) {
      console.error("Failed to check admin status:", err);
      return false;
    }
  }

  // Hide admin links by replacing them with disabled buttons or removing them
  function hideAdminLinks() {
    // Hide admin navigation link
    const adminNavLinks = document.querySelectorAll("a[href='admin.html']");
    adminNavLinks.forEach(link => {
      if (link.closest(".global-page-nav")) return;
      link.style.display = "none";
    });

    // Hide admin navigation link with relative path
    const adminNavLinksRelative = document.querySelectorAll("a[href='../admin.html']");
    adminNavLinksRelative.forEach(link => {
      if (link.closest(".global-page-nav")) return;
      link.style.display = "none";
    });

    // Hide admin side panel links
    const adminSideLinks = document.querySelectorAll("a.side-link[href='admin.html']");
    adminSideLinks.forEach(link => {
      link.style.display = "none";
    });

    // Hide admin buttons
    const adminButtons = document.querySelectorAll("a.button[href='admin.html'], a.button.ghost[href='admin.html']");
    adminButtons.forEach(btn => {
      if (btn.closest(".global-page-nav")) return;
      btn.style.display = "none";
    });

    // Hide any other admin references
    const allAdminLinks = document.querySelectorAll("[href*='admin.html']");
    allAdminLinks.forEach(link => {
      // Only hide if it's not the current page
      if (!window.location.pathname.includes("admin.html") && !link.closest(".global-page-nav")) {
        link.style.display = "none";
      }
    });
  }

  // Check admin status on page load
  const isAdmin = await isUserAdmin();
  
  if (!isAdmin) {
    // Hide admin links from regular users
    hideAdminLinks();
  }
})();
