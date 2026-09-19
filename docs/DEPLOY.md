# Deployment guide

## Architecture

```text
GitHub
  ├── Vercel → public frontend + /api proxy
  └── Render/VPS → Node core API + Telegram + scheduler
```

Vercel supports a `public` output directory and rewrites, while the Node core is better suited to a long-running web service. Render documents Node web services with `npm install` + `npm start` and requires the service to listen on the supplied `PORT`.

## Vercel

1. Import the GitHub repo.
2. Framework: **Other**.
3. Output Directory: `public`.
4. Leave Build Command empty.
5. Add `BACKEND_URL` pointing to the Node core URL.
6. Deploy.

## Render

1. New → Web Service.
2. Connect this GitHub repository.
3. Build: `npm install`.
4. Start: `npm start`.
5. Health Check: `/health`.
6. Add environment variables from `.env.example`.

### Data persistence

`data/db.json` is a local JSON store. For production paid orders, do not depend on an ephemeral filesystem. Use a VPS filesystem, a paid persistent disk, or migrate the store to PostgreSQL/Firestore.

## Two domains

Attach both domains to the same Vercel project if they should show the same frontend. Vercel supports multiple custom domains per project. If one domain should be an admin-only host, enforce that on the server as well; DNS/domain separation alone is not authentication.
