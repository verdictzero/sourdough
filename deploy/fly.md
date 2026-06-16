# Deploying Sourdough to Fly.io

`fly launch` already generated the `Dockerfile` + `docker-entrypoint.js` (Node
22.21, `next build` + `next start`). `fly.toml` is configured here with:
- `internal_port = 3000` (matches `next start`; the generator's default of 8080
  was a mismatch and is corrected)
- a **persistent volume** `sourdough_data` mounted at `/data`, with
  `DATABASE_PATH=/data/sourdough.db`, so the SQLite DB survives deploys

## Deploy

```bash
# 1. Create the volume ONCE (deploys fail if the mount target doesn't exist)
fly volumes create sourdough_data --region iad --size 1 --app sourdough

# 2. Deploy (Fly builds the Dockerfile on a remote builder)
fly deploy

# 3. Check it
fly logs
curl https://sourdough.fly.dev/api/apis     # should return the 7-API JSON
```

First request creates/migrates/seeds the DB on the volume. Seed admin is
`demo@sourdough.dev` / `password` — change it after first login.

> SQLite is single-writer: keep this to **one** machine (don't `fly scale count >1`).

## Point sourdough.vaportrash.net at Fly

DNS for `vaportrash.net` is managed at DreamHost, so the records go there.

### 1. Register the domain with Fly (prints the exact records)
```bash
fly certs add sourdough.vaportrash.net
fly certs show sourdough.vaportrash.net    # re-run to watch the cert go valid
```
For a subdomain, Fly wants a **CNAME → `sourdough.fly.dev`** plus an
`_acme-challenge` record it prints for cert validation.

### 2. Stop DreamHost from hosting the subdomain (the step everyone misses)
`sourdough.vaportrash.net` is a *hosted website* on DreamHost, which pins an A
record to the shared server — a CNAME can't coexist with it:
- Panel → **Manage Websites** → find `sourdough.vaportrash.net` → **Remove**
  (delete the website). This does **not** touch `vaportrash.net`'s DNS.

### 3. Add the CNAME at DreamHost
- Panel → **Manage Websites** → `vaportrash.net` → **⋮** → **DNS Settings**
- **Add Record**:
  - **Name / Host:** `sourdough`
  - **Type:** `CNAME`
  - **Value:** `sourdough.fly.dev.`
- Also add any `_acme-challenge` / `_fly-ownership` record `fly certs show` listed.

### 4. Wait + verify
When `fly certs show sourdough.vaportrash.net` reports the cert issued, load
**https://sourdough.vaportrash.net**. The session cookie is `Secure`; Fly serves
HTTPS (`force_https`), so logins work once the cert is live.
