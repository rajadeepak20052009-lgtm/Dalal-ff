/* ---------------------------------------------------------
   Home page: send likes + daily autolikes
   --------------------------------------------------------- */
(async () => {
  const { $, api, note, busy, nfmt, esc, timeAgo, countUp } = FFL;
  const cfg = await FFL.applyConfig();

  $("year").textContent = new Date().getFullYear();
  if (cfg.service) {
    $("svcWindow").textContent = `${cfg.service.openTime} - ${cfg.service.closeTime} IST`;
    if (cfg.service.autolikesMinBalance) $("alMin").textContent = nfmt(cfg.service.autolikesMinBalance);
  }
  if (cfg.site && cfg.site.youtubeTutorial) $("tutorial").src = cfg.site.youtubeTutorial;

  $("waBanner").addEventListener("click", () => {
    const link = (cfg.contact && cfg.contact.whatsapp) || "#";
    window.open(link, "_blank", "noopener");
  });

  api("/api/stats/public").then((r) => {
    if (r && r.ok) countUp($("statLikes"), r.totalLikes || 0);
  });

  if (cfg.service && cfg.service.open === false) {
    note($("sendResult"), "warn", `<b>Service is offline right now.</b><br>Timing: ${esc(cfg.service.openTime)} - ${esc(cfg.service.closeTime)} IST`);
  }

  /* ---------- live code check ---------- */
  let checkTimer;
  $("coupon").addEventListener("input", () => {
    clearTimeout(checkTimer);
    const code = $("coupon").value.trim();
    if (code.length < 4) {
      note($("couponStatus"), "info", "");
      $("historyCard").hidden = true;
      return;
    }
    checkTimer = setTimeout(async () => {
      const r = await api("/api/coupon/check", { method: "POST", body: { coupon: code } });
      note($("couponStatus"), r.ok ? "ok" : "err", esc(r.message || "Could not check this code"));
      if (r.ok) loadHistory(code);
      else $("historyCard").hidden = true;
    }, 420);
  });

  /* ---------- send likes ---------- */
  async function sendLikes() {
    const btn = $("sendBtn");
    const uid = $("uid").value.trim();
    const coupon = $("coupon").value.trim();
    if (!/^\d{6,20}$/.test(uid)) return note($("sendResult"), "err", "Enter a valid Free Fire UID (numbers only).");
    if (!coupon) return note($("sendResult"), "err", "Enter your redeem code.");

    busy(btn, true, "Sending likes…");
    const r = await api("/api/likes/send", { method: "POST", body: { uid, coupon, region: $("region").value } });
    busy(btn, false);

    if (r.ok) {
      note($("sendResult"), "", "");
      renderReceipt(r);
      loadHistory(coupon, uid);
    } else {
      $("receipt").innerHTML = "";
      note($("sendResult"), "err", "❌ " + esc(r.message || "Something went wrong"));
    }
  }
  $("sendBtn").addEventListener("click", sendLikes);
  $("uid").addEventListener("keydown", (e) => e.key === "Enter" && sendLikes());
  $("coupon").addEventListener("keydown", (e) => e.key === "Enter" && sendLikes());

  function renderReceipt(r) {
    const pct = r.total ? Math.max(0, Math.min(100, (r.balance / r.total) * 100)) : 0;
    $("receipt").innerHTML = `
      <div class="receipt">
        <div class="receipt-badge"><i class="fas fa-circle-check"></i> Delivered</div>
        <div class="receipt-count"><span id="rcNum">0</span><small>likes added</small></div>
        <div class="receipt-player">
          <i class="fas fa-user-astronaut"></i>
          <div>
            <b>${esc(r.nickname || "Free Fire Player")}</b>
            <small>UID ${esc(r.uid)}</small>
          </div>
        </div>
        <div class="receipt-grid">
          <div><span>Before</span><b>${r.likes_before != null ? nfmt(r.likes_before) : "—"}</b></div>
          <div><span>After</span><b>${r.likes_after != null ? nfmt(r.likes_after) : "—"}</b></div>
          <div><span>Code left</span><b>${nfmt(r.balance)}</b></div>
        </div>
        <div class="meter"><i style="width:${pct}%"></i></div>
        <div class="receipt-foot"><i class="fas fa-shield-halved"></i> Safe delivery • ${new Date(r.at || Date.now()).toLocaleString("en-IN")}</div>
      </div>`;
    countUp(document.getElementById("rcNum"), r.likes_added || 0);
    $("receipt").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function loadHistory(coupon, uid) {
    const code = (coupon || "").trim();
    if (!code) return ($("historyCard").hidden = true);
    const qs = new URLSearchParams({ coupon: code });
    if (uid) qs.set("uid", uid);
    const r = await api("/api/likes/history?" + qs.toString());
    if (!r.ok || !r.rows || !r.rows.length) return ($("historyCard").hidden = true);
    $("historyCard").hidden = false;
    $("historyList").innerHTML = r.rows
      .map(
        (s) => `<div class="history-item">
          <div><b>+${nfmt(s.likes)}</b> <span class="muted">likes</span><br><small class="muted">UID ${esc(s.uid)} • ${esc(s.coupon || "-")}</small></div>
          <small class="muted">${esc(timeAgo(s.at))}</small>
        </div>`
      )
      .join("");
  }

  /* ---------- autolikes ---------- */
  async function enableAutoLikes() {
    const btn = $("alBtn");
    const uid = $("alUid").value.trim();
    const coupon = $("alCoupon").value.trim();
    if (!/^\d{6,20}$/.test(uid)) return note($("alResult"), "err", "Enter a valid Free Fire UID.");
    if (!coupon) return note($("alResult"), "err", "Enter your redeem code.");

    busy(btn, true, "Enabling…");
    const r = await api("/api/autolikes/enable", { method: "POST", body: { uid, coupon, region: $("alRegion").value } });
    busy(btn, false);
    note($("alResult"), r.ok ? "ok" : "err", esc(r.message || "Failed"));
    if (r.ok) loadAutoLikes(uid, coupon);
  }
  $("alBtn").addEventListener("click", enableAutoLikes);

  async function loadAutoLikes(uid, coupon) {
    const qs = new URLSearchParams();
    if (uid) qs.set("uid", uid);
    if (coupon) qs.set("coupon", coupon);
    if (![...qs.keys()].length) return ($("alList").innerHTML = "");
    const r = await api("/api/autolikes/list?" + qs.toString());
    if (!r.ok || !r.rows.length) return ($("alList").innerHTML = "");
    $("alList").innerHTML =
      '<div class="section-title"><i class="fas fa-list"></i> Your subscriptions</div>' +
      r.rows
        .map(
          (a) => `<div class="history-item">
            <div><b>UID ${esc(a.uid)}</b><br><small class="muted">${esc(a.coupon)} • ${a.active ? "active" : "paused"} • ${esc(a.lastResult || "not run yet")}</small></div>
            <button class="btn btn-sm ${a.active ? "btn-danger" : "btn-ghost"}" data-al="${esc(a.id)}">${a.active ? "Stop" : "Start"}</button>
          </div>`
        )
        .join("");
    FFL.$$("[data-al]", $("alList")).forEach((btn) => {
      btn.addEventListener("click", async () => {
        busy(btn, true, "…");
        const r2 = await api("/api/autolikes/toggle", { method: "POST", body: { id: btn.dataset.al } });
        busy(btn, false);
        note($("alResult"), r2.ok ? "ok" : "err", esc(r2.message || "Failed"));
        loadAutoLikes($("alUid").value.trim(), $("alCoupon").value.trim());
      });
    });
  }

  $("alCoupon").addEventListener("change", () => loadAutoLikes($("alUid").value.trim(), $("alCoupon").value.trim()));
})();
