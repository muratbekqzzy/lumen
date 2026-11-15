/* Lumen's atmosphere. Decorative only: no library content or network requests. */
(() => {
  "use strict";
  const atmosphere = document.createElement("div");
  atmosphere.className = "lumen-atmosphere";
  atmosphere.setAttribute("aria-hidden", "true");
  atmosphere.innerHTML = '<div class="aura-layer aura-space"><i class="aura-cloud"></i><i class="aura-stars"></i></div><div class="aura-layer aura-sky"><i class="aura-cloud"></i><i class="aura-stars"></i></div><div class="aura-grain"></div>';
  document.body.prepend(atmosphere);
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  function updateMotion() {
    const calm = document.documentElement.dataset.motion === "calm" || media.matches;
    atmosphere.classList.toggle("aura-still", calm || document.hidden);
  }
  function updateScene() {
    const view = document.documentElement.dataset.view;
    const path = location.hash.split("?")[0];
    document.body.dataset.scene = view || (["", "#", "#/", "#/graph"].includes(path) ? "universe" : "reading");
  }
  function updateTheme() {
    const theme = document.documentElement.dataset.theme;
    const sky = theme === "sky" || theme === "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", sky ? "#faeafa" : "#21132f");
  }
  document.addEventListener("visibilitychange", updateMotion);
  window.addEventListener("lumen-motion-changed", updateMotion);
  window.addEventListener("lumen-theme-changed", updateTheme);
  window.addEventListener("lumen-scene-changed", updateScene);
  media.addEventListener?.("change", updateMotion);
  updateTheme(); updateScene(); updateMotion();
})();
