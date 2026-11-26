# Free GST Billing Software

Free, open-source GST invoice & billing for India (and 22 other countries).  
Works offline. Your data stays on your computer.

**Stack (PERN-style):**

| Layer | Tech |
|--------|------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | PostgreSQL (embedded PGlite by default, or real Postgres via `DATABASE_URL`) |

> This is **not** MERN (no MongoDB). Database is **PostgreSQL**.

---

## Quick start (development)

**Requirements:** Node.js 18+

```bash
# from repo root
npm install
```

**Two terminals** (run separately):

```bash
# Terminal 1 — API + database
npm run backend

# Terminal 2 — React UI
npm run frontend
```

| What | URL |
|------|-----|
| **App (use this)** | http://127.0.0.1:5173 |
| Backend API | http://127.0.0.1:47371 |

- Frontend alone → UI opens; API calls fail if backend is stopped.  
- Backend alone → API works; no Vite UI until `npm run frontend`.  
- Backend stop → **API stops**.  
- Opening http://127.0.0.1:47371 in the browser redirects to the Vite UI in dev.

---

## Project structure

```
Free-GST-Billing-Software/
├── frontend/                 # React app
│   ├── public/
│   ├── src/
│   │   ├── app/              # App.jsx, main, store, CSS
│   │   ├── components/       # Feature UI (clients, invoices, …)
│   │   ├── hooks/
│   │   ├── layout/           # Shell (header, footer, help, …)
│   │   └── services/
│   ├── index.html
│   ├── jsconfig.json
│   └── vite.config.js
│
├── backend/                  # Express API + data
│   ├── server.js             # Entry
│   ├── routes/               # HTTP routes
│   ├── services/             # Store helpers (file / PostgreSQL)
│   ├── modules/              # Shared business logic
│   ├── db/                   # Schema, PGlite / Postgres client
│   ├── data/                 # Books + PGlite files (local DB)
│   ├── dist/                 # Production UI build (release)
│   ├── docker-compose.yml    # Optional real PostgreSQL
│   └── tools/                # Scripts, docs, installer, meta
│
├── package.json              # One package — shared node_modules
└── README.md
```

**One `node_modules` at the repo root** — frontend and backend share the same install (`npm install` once).

---

## Database

### Default (no Docker needed)

Embedded **PostgreSQL via PGlite** → `backend/data/pglite`  
On first start, existing JSON files under `backend/data/` are imported automatically.

### Optional real PostgreSQL

```bash
# needs Docker
npm run db:up

# then set in .env (see backend/tools/meta/.env.example):
# DATABASE_URL=postgres://freegst:freegst@127.0.0.1:5432/freegst

npm run backend
```

### Escape hatch (old JSON files only)

```bash
# Windows PowerShell
$env:USE_FILE_STORE="1"; npm run backend
```

---

## npm scripts

| Script | What it does |
|--------|----------------|
| `npm run backend` | Start Express (API + DB) on port **47371** |
| `npm run frontend` | Start Vite React UI on port **5173** |
| `npm run build` | Build frontend → `backend/dist` |
| `npm start` | Run backend only (serves built `dist` in release layout) |
| `npm run db:up` / `db:down` | Start/stop optional Postgres (Docker) |
| `npm test` | Unit + smoke tests |
| `npm run lint` | ESLint |

---

## How frontend ↔ backend connect

```
Browser  →  http://127.0.0.1:5173     (Vite / React)
                 │
                 │  fetch('/api/...')
                 ▼
            Vite proxy
                 │
                 ▼
         http://127.0.0.1:47371       (Express + PostgreSQL)
```

Vite reads `backend/data/port.txt` so the proxy tracks Express if the port drifts (47372, …).

---

## Environment (optional)

Copy `backend/tools/meta/.env.example` to a `.env` at the **repo root** if you need overrides.

| Variable | Meaning |
|----------|---------|
| `DATABASE_URL` | Real Postgres connection string |
| `USE_FILE_STORE=1` | Use JSON files instead of PostgreSQL |
| `FRONTEND_DEV_URL` | Dev UI URL (default `http://127.0.0.1:5173`) |
| `USE_DIST=1` | Serve `backend/dist` instead of redirecting to Vite |

**No `.env` required** for normal local development — defaults work.

---

## What the product does

- Tax Invoice, Quotation, Proforma, Bill of Supply, Credit Note, Delivery Challan  
- GSTR-1 / GSTR-3B JSON, GSTR-2B reconciliation, e-Way / e-Invoice helpers  
- Clients, products, stock, purchases, expenses, cash book, reports  
- Offline-first PWA, daily backups, multi-business profiles  

More detail: `backend/tools/docs/` and the [releases page](https://github.com/IamRamgarhia/Free-GST-Billing-Software/releases/latest).

---

## Production / release

```bash
npm run build          # writes backend/dist
npm run release:zip    # full release package (see backend/tools/scripts)
```

Installed / ZIP layout serves UI from `dist/` next to `server.js` (no Vite).

---

## License

MIT — see `backend/tools/meta/LICENSE`.

---

## Support

- Issues: [GitHub Issues](https://github.com/IamRamgarhia/Free-GST-Billing-Software/issues)  
- Changelog: `backend/tools/meta/CHANGELOG.md`  
- Security: `backend/tools/meta/SECURITY.md`
