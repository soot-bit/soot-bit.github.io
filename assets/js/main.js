(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;

  const getTheme = () => document.documentElement.dataset.theme || "dark";
  const setTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  };

  toggle.addEventListener("click", () => {
    const current = getTheme();
    setTheme(current === "dark" ? "light" : "dark");
  });
})();

