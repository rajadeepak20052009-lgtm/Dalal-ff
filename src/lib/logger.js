/** Minimal timestamped logger with tags. */
const COLORS = { info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", ok: "\x1b[32m" };

function stamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function write(level, tag, args) {
  const color = COLORS[level] || "";
  const reset = color ? "\x1b[0m" : "";
  const prefix = `${color}[${stamp()}] [${tag}]${reset}`;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(prefix, ...args);
}

function tagged(tag) {
  return {
    info: (...a) => write("info", tag, a),
    ok: (...a) => write("ok", tag, a),
    warn: (...a) => write("warn", tag, a),
    error: (...a) => write("error", tag, a),
  };
}

module.exports = { logger: tagged, log: tagged("app") };
