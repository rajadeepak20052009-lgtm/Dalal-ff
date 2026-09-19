/* ---------------------------------------------------------
   Shared frontend helpers (loaded on every page)
   --------------------------------------------------------- */
const FFL = (() => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const nfmt = (v) => Number(v || 0).toLocaleString("en-IN");

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function api(path, { method = "GET", body, token } = {}) {
    try {
      const headers = {};
      if (body) headers["Content-Type"] = "application/json";
      const stored = token === undefined ? localStorage.getItem("ffl_admin_token") : token;
      if (stored) headers["Authorization"] = "Bearer " + stored;
      const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, ...data };
    } catch (e) {
      return { ok: false, status: 0, message: "Network error: " + e.message };
    }
  }

  function note(el, kind, html) {
    if (!el) return;
    el.innerHTML = html ? `<div class="note ${kind}">${html}</div>` : "";
  }

  function busy(btn, on, labelHtml) {
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner spin"></i> ' + (labelHtml || "Please wait…");
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label || btn.innerHTML;
    }
  }

  function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function countUp(el, to, duration = 900) {
    if (!el) return;
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration);
      el.textContent = nfmt(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function copy(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text);
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return Promise.resolve();
  }

  /** Tab groups: <div class="tabs" data-tabs><button class="tab" data-panel="x">…  */
  function initTabs(root = document) {
    $$(".tabs", root).forEach((group) => {
      const tabs = $$(".tab", group);
      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          tabs.forEach((t) => t.classList.toggle("active", t === tab));
          tabs.forEach((t) => {
            const panel = document.getElementById(t.dataset.panel);
            if (panel) panel.hidden = t !== tab;
          });
        });
      });
      const active = tabs.find((t) => t.classList.contains("active")) || tabs[0];
      if (active) active.click();
    });
  }

  let cfgCache = null;
  async function config() {
    if (cfgCache) return cfgCache;
    const r = await api("/api/config");
    cfgCache = r && r.ok ? r : { site: {}, contact: {}, service: {}, packages: [], brand: {} };
    return cfgCache;
  }

  /** Fill [data-cfg="contact.whatsapp"] links/text from /api/config */
  async function applyConfig() {
    const cfg = await config();
    const read = (path) => path.split(".").reduce((o, k) => (o == null ? null : o[k]), cfg);
    $$("[data-cfg-href]").forEach((el) => {
      const v = read(el.dataset.cfgHref);
      if (v) el.href = v;
    });
    $$("[data-cfg-text]").forEach((el) => {
      const v = read(el.dataset.cfgText);
      if (v != null) el.textContent = v;
    });
    return cfg;
  }

  document.addEventListener("DOMContentLoaded", () => initTabs());

  return { $, $$, api, note, busy, nfmt, esc, timeAgo, countUp, copy, config, applyConfig, initTabs };
})();
