/**
 * Tiny .env loader (no dependencies).
 * Values already present in process.env always win.
 */
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  const target = file || path.join(__dirname, "..", "..", ".env");
  if (!fs.existsSync(target)) return {};
  const out = {};
  const raw = fs.readFileSync(target, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i < 1) continue;
    const key = s.slice(0, i).trim();
    let value = s.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return out;
}

module.exports = { loadEnv };
