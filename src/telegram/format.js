/** HTML message builders + parser for the "send it back to upload" flow. */
const { nfmt, istStamp } = require("../lib/utils");

function esc(s) {
  return String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}

function card(title, rows, footer) {
  const lines = (rows || [])
    .filter((r) => Array.isArray(r) && r[1] !== undefined && r[1] !== null && r[1] !== "")
    .map(([k, v]) => `• <b>${esc(k)}:</b> <code>${esc(v)}</code>`)
    .join("\n");
  return `<b>${esc(title)}</b>\n\n${lines}\n\n<i>${esc(footer || istStamp())}</i>`;
}

function deliveryCard(row) {
  return card("⚡ LIKES DELIVERED", [
    ["UID", row.uid],
    ["Nickname", row.nickname || "-"],
    ["Region", row.region],
    ["Likes added", nfmt(row.likes)],
    ["Likes before", row.likes_before != null ? nfmt(row.likes_before) : "-"],
    ["Likes after", row.likes_after != null ? nfmt(row.likes_after) : "-"],
    ["Code", row.coupon],
    ["Balance left", row.balance != null ? nfmt(row.balance) : "-"],
    ["Source", row.source || "web"],
    ["Time", row.at ? new Date(row.at).toISOString() : ""],
  ]);
}

/**
 * Parse a delivery card (or a free-form line) that the owner forwards back to
 * the bot, so the data can be re-uploaded into the database automatically.
 * Supports:
 *   - a forwarded "⚡ LIKES DELIVERED" card
 *   - `upload uid=123456789 likes=100 code=FF-XXXX nickname=NAME`
 *   - `123456789 100 FF-XXXX`
 */
function parseUpload(text) {
  const raw = String(text || "");
  const grab = (labels) => {
    for (const label of labels) {
      const re = new RegExp(`${label}\\s*[:=]\\s*([^\\n•,]+)`, "i");
      const m = re.exec(raw);
      if (m) return m[1].trim();
    }
    return null;
  };
  const num = (v) => {
    if (v == null) return null;
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  let uid = grab(["uid", "user id", "player id"]);
  let likes = num(grab(["likes added", "likes_added", "likes"]));
  let coupon = grab(["code", "coupon", "redeem code"]);
  const nickname = grab(["nickname", "player", "name"]);
  const before = num(grab(["likes before", "likes_before", "before"]));
  const after = num(grab(["likes after", "likes_after", "after"]));
  const region = grab(["region", "server"]);

  if (!uid || !likes) {
    const short = /(\d{6,20})\s+(\d{1,6})(?:\s+([A-Za-z0-9-]{4,}))?/.exec(raw);
    if (short) {
      uid = uid || short[1];
      likes = likes || Number(short[2]);
      coupon = coupon || short[3] || null;
    }
  }

  if (!uid) return { ok: false, message: "UID not found in the message" };
  return {
    ok: true,
    row: {
      uid: String(uid).replace(/\D/g, ""),
      likes: likes || null,
      coupon: coupon ? coupon.toUpperCase() : null,
      nickname: nickname && !/^-$/.test(nickname) ? nickname : null,
      likes_before: before,
      likes_after: after,
      region: region ? region.toUpperCase() : "IND",
    },
  };
}

/** `/addcode FF-ABC123 1500` or `FF-ABC123 1500 likes` */
function parseCodeUpload(text) {
  const m = /([A-Za-z0-9][A-Za-z0-9-]{3,})\s+(\d{2,7})/.exec(String(text || "").replace(/^\/\w+\s*/, ""));
  if (!m) return { ok: false, message: "Format: /addcode CODE LIKES  (e.g. /addcode FF-ABC12345 1500)" };
  return { ok: true, code: m[1].toUpperCase(), likes: Number(m[2]) };
}

module.exports = { esc, card, deliveryCard, parseUpload, parseCodeUpload };
