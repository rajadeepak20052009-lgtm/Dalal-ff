/**
 * Owner bot: payment approval, reports on demand, and automatic data upload
 * when the owner forwards a delivery card back to the bot.
 */
const client = require("./client");
const fmt = require("./format");
const notify = require("./notify");
const orders = require("../services/orders");
const coupons = require("../services/coupons");
const likesService = require("../services/likes");
const autolikes = require("../services/autolikes");
const stats = require("../services/stats");
const store = require("../db/store");
const { config } = require("../config");
const { nfmt, istStamp } = require("../lib/utils");
const { logger } = require("../lib/logger");

const log = logger("telegram");
const awaitingCode = new Map(); // orderId -> { chatId, expiresAt }

const HELP = [
  "<b>🤖 FF LIKES owner bot</b>",
  "",
  "<b>Reports</b>",
  "/stats — live dashboard summary",
  "/orders — orders waiting for approval",
  "/codes — redeem code inventory summary",
  "/autolikes — active AutoLikes subscriptions",
  "/find &lt;uid|code&gt; — full detail of a UID or code",
  "",
  "<b>Data upload</b>",
  "/addcode CODE LIKES — add or top-up a redeem code",
  "/upload uid=… likes=… code=… — save a delivery record",
  "Forward any <b>LIKES DELIVERED</b> card back to me and I will upload it automatically.",
  "",
  "<b>Payments</b>",
  "Press ✅ YES, then send the redeem code within 5 minutes.",
].join("\n");

function reply(chatId, text, extra) {
  return client.sendMessage(chatId, text, extra);
}

/* ------------------------- report builders ------------------------- */
function statsText() {
  const s = stats.overview();
  return fmt.card("📊 LIVE STATS", [
    ["Likes today", nfmt(s.likes.today)],
    ["Likes total", nfmt(s.likes.total)],
    ["Deliveries today", nfmt(s.likes.todayDeliveries)],
    ["Unique UIDs today", nfmt(s.uids.today)],
    ["Codes active", `${nfmt(s.coupons.active)} / ${nfmt(s.coupons.total)}`],
    ["Code balance", nfmt(s.coupons.balance)],
    ["Orders in review", nfmt(s.orders.review)],
    ["Revenue", "₹" + nfmt(s.orders.revenue)],
    ["AutoLikes active", nfmt(s.autolikes.active)],
    ["Service", s.service.open ? "OPEN (" + s.service.window + ")" : "CLOSED (" + s.service.window + ")"],
    ["Likes API", s.api.keyConfigured ? "configured" : "KEY MISSING"],
  ]);
}

function ordersText() {
  const rows = orders.pending(10);
  if (!rows.length) return "✅ <b>No pending orders.</b>";
  return (
    "<b>🧾 PENDING ORDERS</b>\n\n" +
    rows
      .map(
        (o) =>
          `• <code>${fmt.esc(o.id)}</code>\n  ${nfmt(o.likes)} likes • ₹${o.price} • <b>${o.status}</b>` +
          (o.utr ? `\n  UTR: <code>${fmt.esc(o.utr)}</code>` : "")
      )
      .join("\n") +
    `\n\n<i>${istStamp()}</i>`
  );
}

function codesText() {
  const db = store.load();
  const active = db.coupons.filter((c) => c.issued && c.balance > 0);
  const locked = db.coupons.filter((c) => !c.issued);
  const top = active
    .slice()
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10)
    .map((c) => `• <code>${fmt.esc(c.code)}</code> — ${nfmt(c.balance)}/${nfmt(c.total)}`)
    .join("\n");
  return (
    fmt.card("🎟 CODE INVENTORY", [
      ["Total codes", nfmt(db.coupons.length)],
      ["Active", nfmt(active.length)],
      ["Locked (unsold)", nfmt(locked.length)],
      ["Total balance", nfmt(db.coupons.reduce((a, c) => a + Number(c.balance || 0), 0))],
    ]) + (top ? `\n\n<b>Top active codes</b>\n${top}` : "")
  );
}

function autolikesText() {
  const rows = autolikes.list({ all: true, limit: 15 }).filter((a) => a.active);
  if (!rows.length) return "🤖 <b>No active AutoLikes subscriptions.</b>";
  return (
    "<b>🤖 ACTIVE AUTOLIKES</b>\n\n" +
    rows
      .map((a) => `• UID <code>${fmt.esc(a.uid)}</code> • ${fmt.esc(a.coupon)} • last: ${fmt.esc(a.lastResult || "not run yet")}`)
      .join("\n")
  );
}

function findText(query) {
  const q = String(query || "").trim();
  if (!q) return "Usage: /find 123456789  <i>or</i>  /find FF-ABC12345";
  const db = store.load();
  if (/^\d{6,20}$/.test(q)) {
    const rows = db.sends.filter((s) => s.uid === q).slice(-8).reverse();
    const subs = db.autolikes.filter((a) => a.uid === q);
    if (!rows.length && !subs.length) return `No data found for UID <code>${fmt.esc(q)}</code>.`;
    return (
      fmt.card("👤 UID REPORT", [
        ["UID", q],
        ["Nickname", (rows[0] && rows[0].nickname) || "-"],
        ["Total likes", nfmt(rows.reduce((a, s) => a + Number(s.likes || 0), 0))],
        ["Deliveries", nfmt(db.sends.filter((s) => s.uid === q).length)],
        ["AutoLikes", subs.some((s) => s.active) ? "ACTIVE" : subs.length ? "inactive" : "-"],
      ]) +
      "\n\n<b>Recent</b>\n" +
      rows.map((s) => `• ${new Date(s.at).toISOString().slice(0, 16).replace("T", " ")} • +${nfmt(s.likes)} • ${fmt.esc(s.coupon || "-")}`).join("\n")
    );
  }
  const c = coupons.get(q);
  if (!c) return `Code <code>${fmt.esc(q.toUpperCase())}</code> not found.`;
  const used = db.sends.filter((s) => s.coupon === c.code);
  return fmt.card("🎟 CODE REPORT", [
    ["Code", c.code],
    ["Balance", `${nfmt(c.balance)} / ${nfmt(c.total)}`],
    ["Status", c.issued ? "ACTIVE" : "LOCKED"],
    ["Order", c.orderId || "-"],
    ["Deliveries", nfmt(used.length)],
    ["Created", String(c.createdAt || "").slice(0, 16).replace("T", " ")],
  ]);
}

/* ------------------------- update handling ------------------------- */
async function handleCallback(q) {
  if (!client.isOwner(q.from && q.from.id)) return client.answerCallback(q.id, "Owner only.", true);
  const chatId = q.message.chat.id;
  const [action, a, b] = String(q.data || "").split(":");

  if (action === "ok") {
    const started = orders.beginCodeWindow(a);
    if (!started.ok) return client.answerCallback(q.id, started.message, true);
    awaitingCode.set(String(a), { chatId, expiresAt: new Date(started.order.codeDeadlineAt).getTime() });
    await client.answerCallback(q.id, "Payment verified. Send the redeem code within 5 minutes.");
    return reply(chatId, `🎟 <b>Redeem code required</b>\nOrder: <code>${fmt.esc(a)}</code>\n\nAb code bhejiye (ya "⚡ Auto-assign" dabaiye).\n⏳ 5:00 minutes`);
  }

  if (action === "auto") {
    const started = orders.beginCodeWindow(a);
    if (!started.ok && started.message && !/awaiting review/.test(started.message)) {
      // continue anyway: order may already be awaiting_code
    }
    const res = orders.autoApprove(a);
    if (!res.ok) return client.answerCallback(q.id, res.message, true);
    awaitingCode.delete(String(a));
    await client.answerCallback(q.id, "Code assigned.");
    notify.orderApproved(res.order, res.coupon).catch(() => {});
    return reply(chatId, `✅ Order <code>${fmt.esc(a)}</code> approved.\nCode: <code>${fmt.esc(res.coupon.code)}</code> (${nfmt(res.coupon.total)} likes)`);
  }

  if (action === "no") {
    const r = orders.reject(a);
    await client.answerCallback(q.id, r.ok ? "Rejected." : r.message);
    return reply(chatId, r.ok ? `❌ Order <code>${fmt.esc(a)}</code> rejected.` : `⚠️ ${fmt.esc(r.message)}`);
  }

  if (action === "up") {
    const res = likesService.importSend({ uid: a, likes: Number(b) });
    await client.answerCallback(q.id, res.ok ? (res.duplicate ? "Already saved." : "Uploaded.") : res.message);
    if (res.ok && !res.duplicate) return reply(chatId, `📥 Record uploaded for UID <code>${fmt.esc(a)}</code> (+${nfmt(b)} likes).`);
    return { ok: true };
  }

  if (action === "hist") {
    await client.answerCallback(q.id, "Loading…");
    return reply(chatId, findText(a));
  }

  return client.answerCallback(q.id, "Unknown action");
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = String(msg.text || msg.caption || "").trim();
  if (!client.isOwner(chatId)) return; // silent for everyone else
  if (!text) return;

  if (/^\/(start|help)\b/i.test(text)) return reply(chatId, HELP);
  if (/^\/stats\b/i.test(text)) return reply(chatId, statsText());
  if (/^\/orders\b/i.test(text)) return reply(chatId, ordersText());
  if (/^\/codes\b/i.test(text)) return reply(chatId, codesText());
  if (/^\/autolikes\b/i.test(text)) return reply(chatId, autolikesText());
  if (/^\/find\b/i.test(text)) return reply(chatId, findText(text.replace(/^\/find\s*/i, "")));

  if (/^\/backup\b/i.test(text)) {
    const name = store.backup("telegram");
    return reply(chatId, name ? `🗂 Backup created: <code>${fmt.esc(name)}</code>` : "⚠️ Backup failed.");
  }

  if (/^\/addcode\b/i.test(text)) {
    const parsed = fmt.parseCodeUpload(text);
    if (!parsed.ok) return reply(chatId, "⚠️ " + fmt.esc(parsed.message));
    const res = coupons.upsert({ code: parsed.code, likes: parsed.likes, issued: true, source: "telegram" });
    if (!res.ok) return reply(chatId, "⚠️ " + fmt.esc(res.message));
    return reply(
      chatId,
      fmt.card(res.created ? "🎟 CODE ADDED" : "🎟 CODE TOPPED UP", [
        ["Code", res.coupon.code],
        ["Balance", `${nfmt(res.coupon.balance)} / ${nfmt(res.coupon.total)}`],
        ["Status", res.coupon.issued ? "ACTIVE" : "LOCKED"],
      ])
    );
  }

  if (/^\/upload\b/i.test(text)) {
    const parsed = fmt.parseUpload(text);
    if (!parsed.ok) return reply(chatId, "⚠️ " + fmt.esc(parsed.message) + "\nFormat: /upload uid=123456789 likes=100 code=FF-ABC12345");
    const res = likesService.importSend(parsed.row);
    if (!res.ok) return reply(chatId, "⚠️ " + fmt.esc(res.message));
    return reply(chatId, fmt.card(res.duplicate ? "📥 ALREADY SAVED" : "📥 RECORD UPLOADED", [
      ["UID", res.row.uid],
      ["Likes", nfmt(res.row.likes)],
      ["Code", res.row.coupon || "-"],
    ]));
  }

  /* redeem code for an approved order */
  const waiting = [...awaitingCode.entries()].filter(([, v]) => v.expiresAt > Date.now());
  if (waiting.length && /^[A-Za-z0-9][A-Za-z0-9-]{3,}$/.test(text) && !text.startsWith("/")) {
    const [orderIdValue] = waiting[waiting.length - 1];
    let res = orders.attachCode(orderIdValue, text);
    if (!res.ok && /not in inventory/i.test(res.message)) {
      const order = orders.list({ limit: 400 }).find((o) => o.id === orderIdValue);
      coupons.upsert({ code: text, likes: order ? order.likes : 0, issued: true, source: "telegram" });
      res = orders.attachCode(orderIdValue, text);
    }
    if (!res.ok) return reply(chatId, "⚠️ " + fmt.esc(res.message));
    awaitingCode.delete(orderIdValue);
    notify.orderApproved(res.order, res.coupon).catch(() => {});
    return reply(chatId, `✅ Code <code>${fmt.esc(res.coupon.code)}</code> order <code>${fmt.esc(orderIdValue)}</code> ko de diya gaya.`);
  }

  /* forwarded delivery card -> automatic upload */
  if (/likes\s*(added|delivered)/i.test(text) || /uid\s*[:=]/i.test(text)) {
    const parsed = fmt.parseUpload(text);
    if (parsed.ok && parsed.row.likes) {
      const res = likesService.importSend(parsed.row);
      if (res.ok) {
        return reply(
          chatId,
          fmt.card(res.duplicate ? "📥 ALREADY IN DATABASE" : "📥 AUTO-UPLOADED FROM MESSAGE", [
            ["UID", res.row.uid],
            ["Nickname", res.row.nickname || "-"],
            ["Likes", nfmt(res.row.likes)],
            ["Code", res.row.coupon || "-"],
          ])
        );
      }
    }
    if (parsed.ok && parsed.row.uid) return reply(chatId, findText(parsed.row.uid));
  }

  if (/^\d{6,20}$/.test(text)) return reply(chatId, findText(text));
  if (text.startsWith("/")) return reply(chatId, HELP);
}

async function handleUpdate(u) {
  if (u.callback_query) return handleCallback(u.callback_query);
  if (u.message) return handleMessage(u.message);
}

function start() {
  if (!config.telegram.enabled) {
    log.warn("bot disabled in config");
    return () => {};
  }
  if (!client.tokenReady()) {
    log.warn("bot disabled: set TELEGRAM_BOT_TOKEN in .env");
    return () => {};
  }

  let offset = 0;
  let stopped = false;

  (async () => {
    const me = await client.call("getMe", {});
    if (me.ok) {
      client.state.tokenOk = true;
      client.state.botUsername = me.result.username;
      log.ok(`bot online as @${me.result.username}`);
    } else {
      log.error("getMe failed:", me.description);
    }
    if (!client.ownerId()) log.warn("TELEGRAM_OWNER_ID missing — notifications paused");
    await client.call("deleteWebhook", { drop_pending_updates: false });
    client.state.polling = true;
    while (!stopped) {
      const data = await client.call("getUpdates", { timeout: 45, offset, allowed_updates: ["message", "callback_query"] });
      if (!data.ok) {
        client.noteError("getUpdates", data);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const u of data.result) {
        offset = u.update_id + 1;
        client.state.lastUpdateAt = new Date().toISOString();
        try {
          await handleUpdate(u);
        } catch (e) {
          log.error("update failed:", e.message);
          client.noteError("update", { description: e.message });
        }
      }
    }
    client.state.polling = false;
  })();

  return () => {
    stopped = true;
  };
}

module.exports = { start, statsText, ordersText, codesText, findText };
