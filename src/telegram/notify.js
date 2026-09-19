/** Outgoing owner notifications. Every event has its own function. */
const client = require("./client");
const fmt = require("./format");
const { nfmt } = require("../lib/utils");

async function likesDelivered(row) {
  if (!client.enabled()) return { ok: false };
  return client.sendToOwner(fmt.deliveryCard(row), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔁 Re-upload this record", callback_data: `up:${row.uid}:${row.likes}` },
          { text: "👤 UID history", callback_data: `hist:${row.uid}` },
        ],
      ],
    },
  });
}

async function paymentReview(order) {
  if (!client.enabled()) return { ok: false };
  const text = fmt.card("💰 PAYMENT RECEIVED", [
    ["Order", order.id],
    ["Package", nfmt(order.likes) + " likes"],
    ["Amount", "₹" + order.price],
    ["UTR", order.utr],
    ["Name", order.name || "-"],
    ["Contact", order.contact || "-"],
  ], "Verify in your UPI app, then choose an action below.");
  return client.sendToOwner(text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ YES — verified", callback_data: `ok:${order.id}` },
          { text: "❌ NO — reject", callback_data: `no:${order.id}` },
        ],
        [{ text: "⚡ Auto-assign a free code", callback_data: `auto:${order.id}` }],
      ],
    },
  });
}

async function orderApproved(order, coupon) {
  if (!client.enabled()) return { ok: false };
  return client.sendToOwner(
    fmt.card("✅ ORDER APPROVED", [
      ["Order", order.id],
      ["Code given", coupon.code],
      ["Likes", nfmt(coupon.total)],
    ])
  );
}

async function autolikes(action, row) {
  if (!client.enabled()) return { ok: false };
  return client.sendToOwner(
    fmt.card("🤖 AUTOLIKES " + String(action).toUpperCase(), [
      ["UID", row.uid],
      ["Region", row.region],
      ["Code", row.coupon],
      ["Balance", row.balance != null ? `${nfmt(row.balance)} / ${nfmt(row.total)}` : "-"],
    ])
  );
}

async function autolikesReport(delivered, total) {
  if (!client.enabled() || !total) return { ok: false };
  return client.sendToOwner(
    fmt.card("📅 DAILY AUTOLIKES REPORT", [
      ["Delivered", `${delivered} / ${total}`],
      ["Failed", total - delivered],
    ])
  );
}

async function adminEvent(title, rows) {
  if (!client.enabled()) return { ok: false };
  return client.sendToOwner(fmt.card(title, rows));
}

module.exports = { likesDelivered, paymentReview, orderApproved, autolikes, autolikesReport, adminEvent };
