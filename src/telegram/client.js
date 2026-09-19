/** Raw Telegram Bot API client (https, no dependency). */
const https = require("https");
const { config } = require("../config");

const state = {
  botUsername: null,
  botName: null,
  tokenOk: false,
  polling: false,
  sentCount: 0,
  lastSentAt: null,
  lastUpdateAt: null,
  lastError: null,
};

function token() {
  return String(config.telegram.botToken || "").trim();
}

function tokenReady() {
  return /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token());
}

function ownerId() {
  const v = String(config.telegram.ownerChatId || "").trim();
  return /^-?\d+$/.test(v) ? v : null;
}

function enabled() {
  return !!config.telegram.enabled && tokenReady() && !!ownerId();
}

function isOwner(id) {
  const o = ownerId();
  return !!o && String(id) === String(o);
}

function noteError(where, r) {
  state.lastError = { where, description: (r && r.description) || String(r || "unknown"), at: new Date().toISOString() };
}

function call(method, payload) {
  return new Promise((resolve) => {
    if (!tokenReady()) return resolve({ ok: false, description: "Telegram bot token is not configured" });
    const data = Buffer.from(JSON.stringify(payload || {}), "utf8");
    const req = https.request(
      {
        host: "api.telegram.org",
        path: `/bot${token()}/${method}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": data.length },
        timeout: method === "getUpdates" ? 70000 : 20000,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({ ok: false, description: "Invalid Telegram response" });
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ ok: false, description: "Telegram network error: " + e.message }));
    req.end(data);
  });
}

async function sendMessage(chatId, text, extra) {
  const r = await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(extra || {}),
  });
  if (r.ok) {
    state.sentCount++;
    state.lastSentAt = new Date().toISOString();
    state.lastError = null;
  } else noteError("sendMessage", r);
  return r;
}

function sendToOwner(text, extra) {
  const chat = ownerId();
  if (!chat) return Promise.resolve({ ok: false, description: "Telegram owner chat id is not configured" });
  return sendMessage(chat, text, extra);
}

function answerCallback(id, text, alert = false) {
  return call("answerCallbackQuery", { callback_query_id: id, text, show_alert: alert });
}

async function selfTest() {
  const steps = [];
  if (!tokenReady()) {
    steps.push({ name: "Bot token", ok: false, info: "Set TELEGRAM_BOT_TOKEN in .env" });
    return { ok: false, steps };
  }
  steps.push({ name: "Bot token", ok: true, info: "configured" });
  const me = await call("getMe", {});
  if (!me.ok) {
    steps.push({ name: "Telegram connection", ok: false, info: me.description });
    return { ok: false, steps };
  }
  state.tokenOk = true;
  state.botUsername = me.result.username;
  state.botName = me.result.first_name;
  steps.push({ name: "Telegram connection", ok: true, info: "@" + me.result.username });
  steps.push({ name: "Owner chat id", ok: !!ownerId(), info: ownerId() || "Set TELEGRAM_OWNER_ID in .env" });
  return { ok: !!ownerId(), steps };
}

function status() {
  return {
    enabled: !!config.telegram.enabled,
    tokenSet: tokenReady(),
    ready: enabled(),
    botUsername: state.botUsername,
    ownerChatId: ownerId(),
    polling: state.polling,
    sentCount: state.sentCount,
    lastSentAt: state.lastSentAt,
    lastUpdateAt: state.lastUpdateAt,
    lastError: state.lastError,
  };
}

module.exports = { state, call, sendMessage, sendToOwner, answerCallback, selfTest, status, tokenReady, ownerId, enabled, isOwner, noteError };
