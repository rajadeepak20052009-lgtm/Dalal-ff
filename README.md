# DALALXLIKE — Vercel + Node Core

This release is prepared for a split deployment:

- **Vercel:** static frontend (`public/`) + a small `/api/*` proxy function.
- **Node host (Render/VPS):** the existing Node.js API, Telegram integration and scheduler.
- **GitHub:** source control and automatic deploy trigger.

## Important security cleanup

Real `.env`, `.env.save`, and customer `data/db.json` are intentionally not included.
Never commit real bot tokens, provider keys, admin passwords, session secrets or customer data.

## 1) Deploy the Node core

Use a Render **Web Service** or a VPS. On Render:

- Build: `npm install`
- Start: `npm start`
- Health: `/health`
- Environment variables: copy `.env.example` and fill in real values.

The current JSON store requires persistent storage for production. A VPS filesystem works; on Render, use a persistent disk or migrate the store to a managed database before relying on it for paid orders.

## 2) Deploy the frontend on Vercel

Import this GitHub repository into Vercel.

- Framework: **Other**
- Output Directory: `public` (already in `vercel.json`)
- Build command: leave empty/default for this static frontend
- Environment variable: `BACKEND_URL=https://YOUR-RENDER-SERVICE.onrender.com`

The Vercel function proxies `/api/*` to the Node core, so the browser keeps using the same domain.

## 3) Two websites / two domains

You can attach two domains to the same Vercel project, so both can serve this same frontend/core entrypoint. If they need different branding/content, add hostname-based configuration in the frontend instead of maintaining two copies.

## 4) Termux

```bash
pkg install nodejs git -y
npm install
cp .env.example .env
nano .env
npm start
```

## 5) Checks

```bash
npm run check
npm run healthcheck
```

## Security changes in this release

- Removed bundled secrets and customer database.
- Production `SESSION_SECRET` is no longer hard-coded.
- Added login and public mutation rate limits.
- Added owner-only protection for admin management, backup and full database export.
- Added safer static path traversal checks.
- Added security headers.
- Render-compatible `0.0.0.0` binding.
- Vercel clean-page rewrites for `/admin`, `/buycoupon`, `/support`.
