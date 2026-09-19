/* ---------------------------------------------------------
   Admin panel: auth + dashboard + orders/codes/sends/autolikes/tools
   --------------------------------------------------------- */
(() => {
  const { $, $$, api, note, busy, nfmt, esc, timeAgo } = FFL;
  const TOKEN_KEY = "ffl_admin_token";
  const token = () => localStorage.getItem(TOKEN_KEY);

  /* ---------------- auth ---------------- */
  async function signIn() {
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || !password) return note($("loginResult"), "err", "Email aur password dono chahiye.");
    busy($("loginBtn"), true, "Signing in…");
    const r = await api("/api/admin/login", { method: "POST", body: { email, password }, token: null });
    busy($("loginBtn"), false);
    if (!r.ok) return note($("loginResult"), "err", esc(r.message || "Login failed"));
    localStorage.setItem(TOKEN_KEY, r.token);
    note($("loginResult"), "", "");
    boot();
  }
  $("loginBtn").addEventListener("click", signIn);
  $("password").addEventListener("keydown", (e) => e.key === "Enter" && signIn());

  $("logoutBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    await api("/api/admin/logout", { method: "POST" });
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  });

  function showLogin() {
    $("loginView").hidden = false;
    $("appView").hidden = true;
    $("logoutBtn").hidden = true;
    $("adminEmail").hidden = true;
  }

  async function boot() {
    if (!token()) return showLogin();
    const me = await api("/api/admin/me");
    if (!me.ok) {
      localStorage.removeItem(TOKEN_KEY);
      return showLogin();
    }
    $("loginView").hidden = true;
    $("appView").hidden = false;
    $("logoutBtn").hidden = false;
    $("adminEmail").hidden = false;
    $("adminEmail").textContent = me.email;
    loadOverview();
    loadOrders();
    loadCodes();
    loadSends();
    loadAutoLikes();
    loadAdmins();
  }

  /* ---------------- sidebar views ---------------- */
  $$(".admin-nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".admin-nav button").forEach((b) => b.classList.toggle("active", b === btn));
      $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== btn.dataset.view));
    });
  });

  /* ---------------- dashboard ---------------- */
  async function loadOverview() {
    const r = await api("/api/admin/overview");
    if (!r.ok) return;
    const s = r.stats;
    const cards = [
      ["Likes today", nfmt(s.likes.today)],
      ["Likes total", nfmt(s.likes.total)],
      ["Deliveries today", nfmt(s.likes.todayDeliveries)],
      ["Unique UIDs", nfmt(s.uids.total)],
      ["Orders in review", nfmt(s.orders.review)],
      ["Revenue", "₹" + nfmt(s.orders.revenue)],
      ["Code balance", nfmt(s.coupons.balance)],
      ["AutoLikes active", nfmt(s.autolikes.active)],
    ];
    $("statCards").innerHTML = cards.map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");

    const max = Math.max(1, ...r.trend.map((t) => t.likes));
    $("trendBars").innerHTML = r.trend
      .map(
        (t) =>
          `<div title="${esc(t.day)}: ${nfmt(t.likes)} likes"><i style="height:${Math.round((t.likes / max) * 100)}%"></i><small>${esc(t.day.slice(5))}</small></div>`
      )
      .join("");

    const tg = r.telegram;
    $("tgStatus").innerHTML = `
      <div>Bot: <b>${tg.botUsername ? "@" + esc(tg.botUsername) : "not connected"}</b></div>
      <div>Owner chat: <b>${esc(tg.ownerChatId || "not set")}</b></div>
      <div>Polling: <span class="pill ${tg.polling ? "ok" : "err"}">${tg.polling ? "live" : "off"}</span></div>
      <div>Messages sent: <b>${nfmt(tg.sentCount)}</b></div>
      ${tg.lastError ? `<div class="note err" style="margin-top:8px">${esc(tg.lastError.where)}: ${esc(tg.lastError.description)}</div>` : ""}
      <div class="muted" style="margin-top:6px">Likes API: ${s.api.keyConfigured ? "configured" : "<b>key missing</b>"} • Service ${s.service.open ? "OPEN" : "CLOSED"} (${esc(s.service.window)})</div>`;

    $("activityList").innerHTML = r.activity.length
      ? r.activity
          .map((a) => `<div class="history-item"><div><b>${esc(a.type)}</b><br><small class="muted">${esc(JSON.stringify(a.detail || {}))}</small></div><small class="muted">${esc(timeAgo(a.at))}</small></div>`)
          .join("")
      : "No activity yet.";
  }

  $("tgTestBtn").addEventListener("click", async () => {
    busy($("tgTestBtn"), true, "Sending…");
    const r = await api("/api/admin/telegram/test", { method: "POST" });
    busy($("tgTestBtn"), false);
    note($("tgResult"), r.ok ? "ok" : "err", (r.steps || []).map((s) => `${s.ok ? "✅" : "❌"} ${esc(s.name)}: ${esc(s.info)}`).join("<br>"));
    loadOverview();
  });

  /* ---------------- orders ---------------- */
  async function loadOrders() {
    const r = await api("/api/admin/orders?status=" + encodeURIComponent($("orderFilter").value));
    const body = $("ordersTable").querySelector("tbody");
    if (!r.ok || !r.rows.length) return (body.innerHTML = '<tr><td colspan="6" class="muted">No orders.</td></tr>');
    const pillFor = (st) => (st === "approved" ? "ok" : st === "rejected" || st === "expired" ? "err" : "warn");
    body.innerHTML = r.rows
      .map(
        (o) => `<tr>
          <td><code>${esc(o.id)}</code><br><small class="muted">${esc(timeAgo(o.createdAt))}</small></td>
          <td>${nfmt(o.likes)} likes<br><small class="muted">₹${nfmt(o.price)}</small></td>
          <td>${esc(o.utr || "-")}</td>
          <td><span class="pill ${pillFor(o.status)}">${esc(o.status)}</span></td>
          <td>${esc(o.coupon || "-")}</td>
          <td class="row-actions">
            ${
              o.status === "review" || o.status === "awaiting_code" || o.status === "pending"
                ? `<input style="width:130px" placeholder="code (optional)" data-code-for="${esc(o.id)}" />
                   <button class="btn btn-sm" data-approve="${esc(o.id)}">Approve</button>
                   <button class="btn btn-sm btn-danger" data-reject="${esc(o.id)}">Reject</button>`
                : "-"
            }
          </td>
        </tr>`
      )
      .join("");

    $$("[data-approve]", body).forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = btn.dataset.approve;
        const codeInput = body.querySelector(`[data-code-for="${id}"]`);
        busy(btn, true, "…");
        const r2 = await api("/api/admin/orders/approve", { method: "POST", body: { id, code: (codeInput && codeInput.value.trim()) || null } });
        busy(btn, false);
        note($("orderResult"), r2.ok ? "ok" : "err", r2.ok ? `Code <b>${esc(r2.coupon.code)}</b> assigned to ${esc(id)}` : esc(r2.message));
        loadOrders();
        loadCodes();
        loadOverview();
      })
    );
    $$("[data-reject]", body).forEach((btn) =>
      btn.addEventListener("click", async () => {
        busy(btn, true, "…");
        const r2 = await api("/api/admin/orders/reject", { method: "POST", body: { id: btn.dataset.reject } });
        busy(btn, false);
        note($("orderResult"), r2.ok ? "ok" : "err", r2.ok ? "Order rejected." : esc(r2.message));
        loadOrders();
      })
    );
  }
  $("orderReload").addEventListener("click", loadOrders);
  $("orderFilter").addEventListener("change", loadOrders);

  /* ---------------- codes ---------------- */
  async function loadCodes() {
    const r = await api("/api/admin/codes?q=" + encodeURIComponent($("codeSearch").value.trim()));
    const body = $("codesTable").querySelector("tbody");
    if (!r.ok || !r.rows.length) return (body.innerHTML = '<tr><td colspan="5" class="muted">No codes.</td></tr>');
    body.innerHTML = r.rows
      .map(
        (c) => `<tr>
          <td><code>${esc(c.code)}</code></td>
          <td><input style="width:110px" value="${Number(c.balance)}" data-bal="${esc(c.code)}" /> <small class="muted">/ ${nfmt(c.total)}</small></td>
          <td><span class="pill ${c.issued ? "ok" : "warn"}">${c.issued ? "active" : "locked"}</span></td>
          <td>${esc(c.orderId || "-")}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-ghost" data-save="${esc(c.code)}">Save</button>
            <button class="btn btn-sm btn-ghost" data-toggle="${esc(c.code)}" data-active="${c.issued ? 0 : 1}">${c.issued ? "Lock" : "Activate"}</button>
            <button class="btn btn-sm btn-danger" data-del="${esc(c.code)}">Delete</button>
          </td>
        </tr>`
      )
      .join("");

    $$("[data-save]", body).forEach((btn) =>
      btn.addEventListener("click", async () => {
        const code = btn.dataset.save;
        const value = body.querySelector(`[data-bal="${code}"]`).value;
        const r2 = await api("/api/admin/codes/balance", { method: "POST", body: { code, balance: Number(value) } });
        note($("codeResult"), r2.ok ? "ok" : "err", r2.ok ? `${esc(code)} updated.` : esc(r2.message));
        loadCodes();
      })
    );
    $$("[data-toggle]", body).forEach((btn) =>
      btn.addEventListener("click", async () => {
        const r2 = await api("/api/admin/codes/active", { method: "POST", body: { code: btn.dataset.toggle, active: btn.dataset.active === "1" } });
        note($("codeResult"), r2.ok ? "ok" : "err", r2.ok ? "Updated." : esc(r2.message));
        loadCodes();
      })
    );
    $$("[data-del]", body).forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm(`Delete code ${btn.dataset.del}?`)) return;
        const r2 = await api("/api/admin/codes/delete", { method: "POST", body: { code: btn.dataset.del } });
        note($("codeResult"), r2.ok ? "ok" : "err", esc(r2.message || "Deleted"));
        loadCodes();
      })
    );
  }
  $("codeReload").addEventListener("click", loadCodes);
  $("codeSearch").addEventListener("input", () => {
    clearTimeout(window.__codeT);
    window.__codeT = setTimeout(loadCodes, 350);
  });
  $("addCodeBtn").addEventListener("click", async () => {
    const code = $("newCode").value.trim();
    const likes = Number($("newLikes").value);
    if (!code || !likes) return note($("codeResult"), "err", "Code aur likes dono daaliye.");
    busy($("addCodeBtn"), true, "Saving…");
    const r = await api("/api/admin/codes/create", { method: "POST", body: { code, likes } });
    busy($("addCodeBtn"), false);
    note($("codeResult"), r.ok ? "ok" : "err", r.ok ? `${esc(r.coupon.code)} → ${nfmt(r.coupon.balance)} likes` : esc(r.message));
    if (r.ok) {
      $("newCode").value = "";
      $("newLikes").value = "";
      loadCodes();
    }
  });

  /* ---------------- deliveries ---------------- */
  async function loadSends() {
    const r = await api("/api/admin/sends?q=" + encodeURIComponent($("sendSearch").value.trim()));
    const body = $("sendsTable").querySelector("tbody");
    if (!r.ok || !r.rows.length) return (body.innerHTML = '<tr><td colspan="6" class="muted">No deliveries yet.</td></tr>');
    body.innerHTML = r.rows
      .map(
        (s) => `<tr>
          <td>${esc(new Date(s.at).toLocaleString("en-IN"))}</td>
          <td><code>${esc(s.uid)}</code></td>
          <td>${esc(s.nickname || "-")}</td>
          <td><b>+${nfmt(s.likes)}</b></td>
          <td>${esc(s.coupon || "-")}</td>
          <td><span class="pill">${esc(s.source || "web")}</span></td>
        </tr>`
      )
      .join("");
  }
  $("sendReload").addEventListener("click", loadSends);
  $("sendSearch").addEventListener("input", () => {
    clearTimeout(window.__sendT);
    window.__sendT = setTimeout(loadSends, 350);
  });

  /* ---------------- autolikes ---------------- */
  async function loadAutoLikes() {
    const r = await api("/api/admin/autolikes");
    const body = $("alTable").querySelector("tbody");
    if (!r.ok || !r.rows.length) return (body.innerHTML = '<tr><td colspan="6" class="muted">No subscriptions.</td></tr>');
    body.innerHTML = r.rows
      .map(
        (a) => `<tr>
          <td><code>${esc(a.uid)}</code></td>
          <td>${esc(a.coupon)}</td>
          <td><span class="pill ${a.active ? "ok" : "warn"}">${a.active ? "active" : "paused"}</span></td>
          <td>${esc(a.lastRun || "-")}</td>
          <td>${esc(a.lastResult || "-")}</td>
          <td><button class="btn btn-sm ${a.active ? "btn-danger" : "btn-ghost"}" data-al="${esc(a.id)}">${a.active ? "Pause" : "Start"}</button></td>
        </tr>`
      )
      .join("");
    $$("[data-al]", body).forEach((btn) =>
      btn.addEventListener("click", async () => {
        busy(btn, true, "…");
        const r2 = await api("/api/admin/autolikes/toggle", { method: "POST", body: { id: btn.dataset.al } });
        busy(btn, false);
        note($("alResult"), r2.ok ? "ok" : "err", esc(r2.message || "Updated"));
        loadAutoLikes();
      })
    );
  }
  $("alReload").addEventListener("click", loadAutoLikes);
  $("alRunBtn").addEventListener("click", async () => {
    busy($("alRunBtn"), true, "Running…");
    const r = await api("/api/admin/autolikes/run", { method: "POST" });
    busy($("alRunBtn"), false);
    note($("alResult"), r.ok ? "ok" : "err", r.ok ? `Ran ${r.ran || 0}, delivered ${r.delivered || 0}.` : esc(r.message));
    loadAutoLikes();
    loadOverview();
  });

  /* ---------------- tools ---------------- */
  $("mSendBtn").addEventListener("click", async () => {
    busy($("mSendBtn"), true, "Sending…");
    const r = await api("/api/admin/likes/send", { method: "POST", body: { uid: $("mUid").value.trim(), coupon: $("mCode").value.trim(), region: "IND" } });
    busy($("mSendBtn"), false);
    note($("mResult"), r.ok ? "ok" : "err", esc(r.message || "Failed"));
    loadSends();
    loadOverview();
  });

  async function loadAdmins() {
    const r = await api("/api/admin/admins");
    const body = $("adminTable").querySelector("tbody");
    if (!r.ok) return;
    body.innerHTML = r.rows
      .map(
        (a) => `<tr>
          <td>${esc(a.email)}</td>
          <td><span class="pill">${esc(a.role)}</span></td>
          <td>${esc(a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString("en-IN") : "-")}</td>
          <td><button class="btn btn-sm btn-danger" data-adel="${esc(a.id)}">Remove</button></td>
        </tr>`
      )
      .join("");
    $$("[data-adel]", body).forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("Remove this admin?")) return;
        const r2 = await api("/api/admin/admins/delete", { method: "POST", body: { id: btn.dataset.adel } });
        note($("adminResult"), r2.ok ? "ok" : "err", esc(r2.message));
        loadAdmins();
      })
    );
  }

  $("addAdminBtn").addEventListener("click", async () => {
    busy($("addAdminBtn"), true, "Saving…");
    const r = await api("/api/admin/admins", { method: "POST", body: { email: $("aEmail").value.trim(), password: $("aPass").value } });
    busy($("addAdminBtn"), false);
    note($("adminResult"), r.ok ? "ok" : "err", r.ok ? "Admin added." : esc(r.message));
    if (r.ok) {
      $("aEmail").value = "";
      $("aPass").value = "";
      loadAdmins();
    }
  });

  $("changePassBtn").addEventListener("click", async () => {
    const r = await api("/api/admin/password", { method: "POST", body: { currentPassword: $("curPass").value, newPassword: $("newPass").value } });
    note($("passResult"), r.ok ? "ok" : "err", esc(r.message || "Failed"));
    if (r.ok) setTimeout(() => { localStorage.removeItem(TOKEN_KEY); location.reload(); }, 1500);
  });

  $("backupBtn").addEventListener("click", async () => {
    const r = await api("/api/admin/backup", { method: "POST" });
    note($("dataResult"), r.ok ? "ok" : "err", r.ok ? `Backup saved: ${esc(r.file)}` : "Backup failed");
  });

  $("exportBtn").addEventListener("click", async () => {
    const r = await api("/api/admin/export");
    if (!r.ok) return note($("dataResult"), "err", "Export failed");
    const blob = new Blob([JSON.stringify(r.db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ffl-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    note($("dataResult"), "ok", "Download started.");
  });

  boot();
})();
