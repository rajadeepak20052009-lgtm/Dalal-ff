/** Small in-memory rate limiter for a single Node service instance. */
const buckets = new Map();

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function allow(req, key, limit, windowMs) {
  const id = `${key}:${clientIp(req)}`;
  const now = Date.now();
  const item = buckets.get(id);
  if (!item || now - item.started >= windowMs) {
    buckets.set(id, { started: now, count: 1 });
    return true;
  }
  item.count += 1;
  return item.count <= limit;
}

setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, item] of buckets) if (item.started < cutoff) buckets.delete(key);
}, 5 * 60 * 1000).unref?.();

module.exports = { allow };
