/** Static file server with clean URLs (/buycoupon -> public/buycoupon.html). */
const fs = require("fs");
const path = require("path");
const { config } = require("../config");

const PUBLIC_DIR = path.join(config.root, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function resolveFile(pathname) {
  let rel = decodeURIComponent(pathname.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  if (!path.extname(rel)) rel += ".html";
  const normalized = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const abs = path.resolve(PUBLIC_DIR, "." + path.sep + normalized.replace(/^[/\\]+/, ""));
  const relative = path.relative(PUBLIC_DIR, abs);
  if (relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)) return null;
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}

function serve(req, res, url) {
  const file = resolveFile(url.pathname === "/" ? "/index.html" : url.pathname);
  if (!file) {
    const notFound = path.join(PUBLIC_DIR, "404.html");
    if (fs.existsSync(notFound)) {
      res.writeHead(404, { "Content-Type": MIME[".html"] });
      return res.end(fs.readFileSync(notFound));
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("404 Not Found");
  }
  const ext = path.extname(file).toLowerCase();
  const cacheable = /\.(css|js|svg|png|jpe?g|webp|ico|woff2)$/.test(ext);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cacheable ? "public, max-age=3600" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  fs.createReadStream(file).pipe(res);
}

module.exports = { serve, PUBLIC_DIR };
