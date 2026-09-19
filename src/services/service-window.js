/** Opening-hours logic (IST). */
const { config } = require("../config");
const { nowIST } = require("../lib/utils");

function minutesOf(hhmm, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return fallback;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isOpen() {
  const d = nowIST(config.service.timezoneOffsetMinutes);
  const now = d.getUTCHours() * 60 + d.getUTCMinutes();
  const open = minutesOf(config.service.openTime, 0);
  const close = minutesOf(config.service.closeTime, 24 * 60);
  return open <= close ? now >= open && now <= close : now >= open || now <= close;
}

function windowText() {
  return `${config.service.openTime} - ${config.service.closeTime} IST`;
}

module.exports = { isOpen, windowText };
