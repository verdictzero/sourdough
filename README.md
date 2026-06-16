# 🥖 Sourdough

A real **API management platform** / marketplace. Providers publish APIs with
pricing plans; consumers sign up, subscribe, and get keys; and every call goes
through a **gateway** that authenticates the key, enforces rate limits and
monthly quotas, meters usage, and proxies to the upstream API.

Built to stay swappable: all storage lives behind repository interfaces, so
moving from SQLite to Postgres is a new file, not a rewrite.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **`node:sqlite`** — Node's built-in SQLite, so there are **zero runtime
  dependencies** beyond Next/React and **no native build step**
- Cookie sessions + scrypt password hashing (Node `crypto`)
- Plain CSS, dark theme by default

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

On first run the DB is created at `data/sourdough.db`, migrated, and seeded.

A demo provider account is seeded so you can log in immediately:

```
email:    demo@sourdough.dev
password: password
```

> Requires Node 22.5+ (for `node:sqlite`). Developed on Node 24 LTS.

## Try the whole loop in 30 seconds

1. **Sign up** (or log in as the demo account above).
2. Open the **Echo** API → **Subscribe** → copy the key shown once.
3. Call it through the gateway:

```bash
curl http://localhost:3000/gateway/echo/hello?name=baker \
  -H "Authorization: Bearer sd_live_..."
# -> {"service":"echo","path":"/hello","query":{"name":"baker"}, ...}
```

4. Watch the call appear under **Dashboard → Recent gateway activity**, with the
   quota meter ticking up. Exceed the plan's rate limit and the gateway returns
   `429` with `X-RateLimit-*` headers.

**Echo** is a real upstream hosted by the app itself (`/demo/echo`), so the
gateway has something live to forward to. Set any API's base URL to `/demo/echo`
to reuse it while experimenting.

## How it works

```
Consumer ──key──▶  /gateway/<slug>/<path>
                        │  authenticate key (sha-256 lookup)
                        │  check subscription + plan
                        │  enforce rate limit (req/min) + quota (calls/month)
                        │  record usage event
                        ▼
                   upstream API (base_url)  ──▶  response (+ rate headers)
```

- **Accounts & sessions** — signup/login set an httpOnly cookie backed by a
  `sessions` row; passwords are scrypt-hashed. `getCurrentUser()` gates the UI
  and the API.
- **Ownership** — listings have an `owner_id`; only the owner (or an admin) can
  edit or delete them.
- **Plans** — each API has one or more plans carrying `quota_month` and
  `rate_limit_per_min`; the gateway enforces them.
- **Keys** — only a SHA-256 hash + a display prefix are stored. The plaintext is
  shown exactly once, at creation. Keys can be minted and revoked per
  subscription.
- **Usage** — every gateway call is metered into `usage_events`, powering the
  dashboard and quota checks.

## Project layout

```
app/
  page.tsx                          Marketplace catalog
  apis/[slug]/                      API detail + subscribe panel
  publish/                          Publish (auth-gated) + form
  dashboard/                        Subscriptions, keys, usage, owned APIs
  login/ · signup/                  Auth pages
  gateway/[slug]/[...path]/route.ts THE GATEWAY (auth, limits, proxy, metering)
  demo/echo/[...path]/route.ts      Built-in live upstream for the Echo API
  api/                              REST API (route handlers) — see below
components/                         UI: cards, badges, plans, auth, dashboard
lib/
  db/types.ts                       Domain model + repository interfaces
  db/migrations.ts                  Versioned, forward-only schema migrations
  db/sqlite.ts                      node:sqlite implementation of every repo + seed
  db/index.ts                       getDb() factory + singleton (driver switch)
  auth/password.ts                  scrypt hash/verify
  auth/session.ts                   cookie sessions + getCurrentUser
  ids.ts · validation.ts            id/key/hash/slug helpers · request validation
data/                               SQLite file (gitignored)
```

## REST API

| Method   | Path                                | Description                              |
| -------- | ----------------------------------- | ---------------------------------------- |
| `POST`   | `/api/auth/signup` · `login` · `logout` | Account + session                    |
| `GET`    | `/api/apis`                         | List APIs (`?q=` `?category=` `?status=` `?mine=1`) |
| `POST`   | `/api/apis`                         | Publish (auth; caller becomes owner)     |
| `GET`    | `/api/apis/:slug`                   | Get one API (with plans)                 |
| `PATCH` / `DELETE` | `/api/apis/:slug`         | Update / delete (owner/admin)            |
| `POST`   | `/api/apis/:slug/subscribe`         | Subscribe on a plan → key (shown once)   |
| `GET`    | `/api/subscriptions`                | Current user's subscriptions + usage     |
| `DELETE` | `/api/subscriptions/:id`            | Cancel a subscription                    |
| `POST`   | `/api/subscriptions/:id/keys`       | Mint another key                         |
| `DELETE` | `/api/keys/:id`                     | Revoke a key                             |
| `ANY`    | `/gateway/:slug/*`                  | **The gateway** — call a subscribed API  |

## Configuration

Copy `.env.example` → `.env.local`. Defaults work out of the box; knobs are
`DB_DRIVER` (default `sqlite`) and `DATABASE_PATH` (default `data/sourdough.db`).

## Roadmap

Shipped: accounts, ownership, plans, hashed keys, the gateway with rate
limits + quotas + usage metering, and migrations.

Natural next steps (not yet built):

- **Postgres** — add `createPgRepositories()` returning the same `Repositories`
  shape; add a `case "postgres"` in `lib/db/index.ts`. Nothing else changes.
- **Billing** — Stripe for paid plans + metered/usage billing and payouts.
- **API docs** — OpenAPI upload + rendered reference and a "try it" console.
- **Ratings & reviews**, favorites, featured/trending.
- **Webhooks & status checks**, background usage rollups, admin/moderation.
- **Tests + CI** (Vitest/Playwright, GitHub Actions) and a Dockerfile.
- **zod** in place of the hand-rolled validators.
