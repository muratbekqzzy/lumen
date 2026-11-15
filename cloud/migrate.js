/* One-time transfer from the old GitHub Pages origin. No credentials cross origins. */
(() => {
  "use strict";
  const LEGACY_ORIGIN = "https://muratbekqzzy.github.io";
  const LEGACY_PATH = "/lumen/";
  const TYPE = "lumen-library-transfer-v1";
  const CHECKPOINT = "lumen.migration.github.v1.";
  const here = new URL(location.href);
  let destination;
  try { destination = new URL(window.LUMEN_SYNC_URL); } catch { return; }
  if (destination.protocol !== "https:" || destination.username || destination.password) return;

  function meaningful(state) {
    return state && state.version === 1 && state.records && typeof state.records === "object" &&
      !Array.isArray(state.records) && Object.keys(state.records).some(id =>
        !["root", "inbox", "archive"].includes(id) && !state.deleted?.[id]);
  }
  function legacyState() {
    try {
      const state = JSON.parse(localStorage.getItem("lumen.cloud.data.v1"));
      if (!meaningful(state)) return null;
      // Deliberately select the library, never saved sync credentials or browser history.
      return {version: 1, records: state.records, deleted: state.deleted || {}};
    } catch { return null; }
  }
  function notice(text, link, label, action) {
    const old = document.querySelector("#lumen-migration-notice");
    if (old) old.remove();
    const panel = document.createElement("div");
    panel.id = "lumen-migration-notice";
    panel.setAttribute("role", "status");
    panel.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:8500;box-sizing:border-box;width:max-content;max-width:calc(100vw - 24px);padding:14px 18px;border:1px solid #63738e;border-radius:12px;background:#1b2332;color:#f2f5fa;box-shadow:0 4px 24px #0005;font:13px/1.6 system-ui;display:flex;align-items:center;gap:12px;flex-wrap:wrap";
    const message = document.createElement("span"); message.textContent = text; panel.append(message);
    if (link) {
      const anchor = document.createElement("a"); anchor.href = link; anchor.textContent = label;
      anchor.style.cssText = "color:#b4d1ff;font-weight:600";
      anchor.target = "_top"; panel.append(anchor);
    }
    if (action) {
      const button = document.createElement("button"); button.type = "button";
      button.textContent = action.label; button.onclick = action.run;
      button.style.cssText = "border:1px solid #64758e;background:#29374d;color:#f2f5fa;padding:6px 10px;border-radius:7px;cursor:pointer;font:inherit";
      panel.append(button);
    }
    const close = document.createElement("button"); close.type = "button";
    close.textContent = "×"; close.setAttribute("aria-label", "Dismiss migration notice");
    close.style.cssText = "border:0;background:transparent;color:#d0daea;font-size:22px;cursor:pointer";
    close.onclick = () => panel.remove(); panel.append(close); document.body.append(panel);
  }
  function exportLegacy() {
    const state = legacyState(); if (!state) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], {type: "application/json"}));
    const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = "lumen-existing-notes.json"; document.body.append(anchor);
    anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (here.origin === LEGACY_ORIGIN && here.pathname === LEGACY_PATH) {
    if (here.searchParams.get("lumen-transfer") === "1" && window.parent !== window) {
      document.documentElement.style.display = "none";
      let replied = false;
      window.addEventListener("message", event => {
        const request = event.data;
        if (replied || event.origin !== destination.origin || event.source !== window.parent ||
            request?.type !== TYPE || request.action !== "request" ||
            typeof request.nonce !== "string" || !/^[a-f0-9-]{36}$/i.test(request.nonce)) return;
        replied = true;
        window.parent.postMessage({type: TYPE, action: "response", nonce: request.nonce,
          state: legacyState()}, destination.origin);
      });
      return;
    }
    const link = new URL(destination.href); link.searchParams.set("from", "legacy");
    notice("Lumen now saves your library across devices after sign-in.", link.href, "Open synced Lumen",
      legacyState() ? {label: "Export existing notes", run: exportLegacy} : null);
    return;
  }
  if (window.LUMEN_HOSTED !== true || here.origin !== destination.origin) return;

  let attempted = new Set();
  async function migrate(user) {
    if (!user?.id || attempted.has(user.id) || !window.LumenCloud?.importData) return;
    const key = CHECKPOINT + user.id;
    try { if (localStorage.getItem(key)) return; } catch {}
    attempted.add(user.id);
    const iframe = document.createElement("iframe");
    iframe.hidden = true; iframe.title = "Import existing Lumen notes";
    iframe.referrerPolicy = "no-referrer";
    iframe.src = LEGACY_ORIGIN + LEGACY_PATH + "?lumen-transfer=1";
    const nonce = crypto.randomUUID();
    let finished = false, timeout;
    const fallback = () => {
      if (here.searchParams.get("from") !== "legacy") return;
      notice("If your existing notes are missing, export them from the previous app, then use Settings → Import backup here.",
        LEGACY_ORIGIN + LEGACY_PATH, "Open previous app");
    };
    function finish() {
      finished = true; clearTimeout(timeout); window.removeEventListener("message", receive); iframe.remove();
    }
    async function receive(event) {
      const response = event.data;
      if (finished || event.origin !== LEGACY_ORIGIN || event.source !== iframe.contentWindow ||
          response?.type !== TYPE || response.action !== "response" || response.nonce !== nonce) return;
      finish();
      if (!meaningful(response.state)) { fallback(); return; }
      if (window.LumenCloud.getUser?.()?.id !== user.id) return;
      try {
        // importData validates the current signed-in account again before storing anything.
        await window.LumenCloud.importData(response.state);
        try { localStorage.setItem(key, new Date().toISOString()); } catch {}
        notice("Imported this browser’s existing notes. Automatic sync will save them to your account.");
      } catch {
        notice("Your existing notes remain in the previous app. Export a backup there and import it in Settings here.",
          LEGACY_ORIGIN + LEGACY_PATH, "Open previous app");
      }
    }
    window.addEventListener("message", receive);
    iframe.onload = () => {
      if (!finished) iframe.contentWindow.postMessage({type: TYPE, action: "request", nonce}, LEGACY_ORIGIN);
    };
    timeout = setTimeout(() => { if (!finished) { finish(); fallback(); } }, 8000);
    document.body.append(iframe);
  }
  window.addEventListener("lumen-account-ready", event => migrate(event.detail));
  const user = window.LumenCloud?.getUser?.();
  if (user) migrate(user);
  else window.LumenCloud?.whenReady?.then(() => migrate(window.LumenCloud.getUser?.()));
})();
