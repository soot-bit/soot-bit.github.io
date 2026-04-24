(() => {
  const layout = document.querySelector(".cvsite-layout");
  const overlay = document.querySelector("[data-overlay]");
  const sidebarNav = document.getElementById("cvsiteSidebarNav");
  const tocNav = document.getElementById("cvsiteTocNav");
  const prevNext = document.getElementById("cvsitePrevNext");

  const openSidebar = () => document.documentElement.classList.add("cvsite-sidebar-open");
  const closeSidebar = () => document.documentElement.classList.remove("cvsite-sidebar-open");
  const openToc = () => document.documentElement.classList.add("cvsite-toc-open");
  const closeToc = () => document.documentElement.classList.remove("cvsite-toc-open");

  document.querySelectorAll("[data-sidebar-toggle]").forEach((btn) => btn.addEventListener("click", openSidebar));
  document.querySelectorAll("[data-sidebar-close]").forEach((btn) => btn.addEventListener("click", closeSidebar));
  document.querySelectorAll("[data-toc-toggle]").forEach((btn) => btn.addEventListener("click", openToc));
  document.querySelectorAll("[data-toc-close]").forEach((btn) => btn.addEventListener("click", closeToc));

  if (overlay) {
    overlay.addEventListener("click", () => {
      closeSidebar();
      closeToc();
    });
  }

  const pageName = (() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  })();

  const currentSlug =
    pageName.endsWith(".html") && pageName !== "index.html" ? pageName.slice(0, -".html".length) : null;

  const buildToc = () => {
    if (!tocNav) return;
    const container = document.querySelector(".cvsite-main");
    if (!container) return;

    const headings = Array.from(container.querySelectorAll("h1[id], h2[id], h3[id]"));
    if (!headings.length) {
      tocNav.innerHTML = '<div class="cvsite-toc__empty">No sections</div>';
      return;
    }

    const items = headings
      .map((h) => {
        const level = h.tagName.toLowerCase();
        const text = (h.textContent || "").replace(/\s+/g, " ").trim();
        const id = h.getAttribute("id");
        if (!id || !text) return null;
        return { level, text, id };
      })
      .filter(Boolean);

    const html = items
      .map((it) => {
        const cls = it.level === "h1" ? "toc-item toc-item--h1" : it.level === "h2" ? "toc-item toc-item--h2" : "toc-item toc-item--h3";
        return `<a class="${cls}" href="#${encodeURIComponent(it.id)}">${escapeHtml(it.text)}</a>`;
      })
      .join("");
    tocNav.innerHTML = html;
  };

  const escapeHtml = (s) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  const buildNav = async () => {
    if (!sidebarNav && !prevNext) return;
    try {
      const res = await fetch("./_tutorials.json", { cache: "no-store" });
      if (!res.ok) return;
      const tutorials = await res.json();
      if (!Array.isArray(tutorials) || !tutorials.length) return;

      if (sidebarNav) {
        sidebarNav.innerHTML = tutorials
          .map((t) => {
            const active = currentSlug && t.slug === currentSlug ? " is-active" : "";
            return `<a class="cvsite-sidelink${active}" href="./${t.slug}.html">${escapeHtml(t.title)}</a>`;
          })
          .join("");
      }

      if (prevNext && currentSlug) {
        const idx = tutorials.findIndex((t) => t.slug === currentSlug);
        if (idx >= 0) {
          const prev = idx > 0 ? tutorials[idx - 1] : null;
          const next = idx < tutorials.length - 1 ? tutorials[idx + 1] : null;

          prevNext.innerHTML = [
            prev
              ? `<a class="cvsite-prevnext__link" href="./${prev.slug}.html"><span class="cvsite-prevnext__k">Previous</span><span class="cvsite-prevnext__t">${escapeHtml(prev.title)}</span></a>`
              : `<div class="cvsite-prevnext__spacer"></div>`,
            next
              ? `<a class="cvsite-prevnext__link cvsite-prevnext__link--next" href="./${next.slug}.html"><span class="cvsite-prevnext__k">Next</span><span class="cvsite-prevnext__t">${escapeHtml(next.title)}</span></a>`
              : `<div class="cvsite-prevnext__spacer"></div>`,
          ].join("");
        }
      }
    } catch {
      // ignore
    }
  };

  buildToc();
  buildNav();

  // Close drawers on escape
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSidebar();
      closeToc();
    }
  });

  // If user clicks a sidebar link on mobile, close the drawer.
  if (layout) {
    layout.addEventListener("click", (e) => {
      const target = e.target;
      if (target instanceof HTMLAnchorElement && target.classList.contains("cvsite-sidelink")) {
        closeSidebar();
      }
    });
  }
})();

