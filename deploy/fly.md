# Deploying Sourdough to Fly.io

The repo ships everything Fly needs: `Dockerfile` (multi-stage, builds Next's
standalone output, runs on Node 24), `fly.toml` (with a persistent volume for
the SQLite file), and `.dockerignore`.

## First-time setup

```bash
# 1. flyctl + login
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Make sure fly.toml's `app = "..."` matches your Fly app (fly apps list)

# 3. Create the persistent volume (SQLite lives here, survives deploys)
fly volumes create sourdough_data --region iad --size 1 --app <your-app>

# 4. Deploy (builds the Dockerfile on a remote builder — no local RAM needed)
fly deploy
```

Check it: `fly logs`, then `curl https://<your-app>.fly.dev/api/apis` (should
return the 7-API JSON). First request creates/migrates/seeds the DB on the volume.

> SQLite = single writer, so run **one** machine (don't scale to multiple).
> Seed admin is `demo@sourdough.dev` / `password` — change it after first login.

## Point sourdough.vaportrash.net at Fly

DNS for `vaportrash.net` is managed at DreamHost, so the records go there.

### 1. Tell Fly about the domain (gives you the exact records to create)
```bash
fly certs add sourdough.vaportrash.net
fly certs show sourdough.vaportrash.net    # re-run to watch the cert go valid
```
For a subdomain, Fly wants a **CNAME → `<your-app>.fly.dev`** (plus an
`_acme-challenge` record it prints for cert validation).

### 2. Stop DreamHost from hosting the subdomain (the step everyone misses)
`sourdough.vaportrash.net` is currently a *hosted website* on DreamHost, which
pins an A record to the shared server — a CNAME can't coexist with it. Remove
the subdomain's hosting first:
- Panel → **Manage Websites** → find `sourdough.vaportrash.net` → **Remove**
  (delete the website). This frees the name; it does **not** touch
  `vaportrash.net`'s DNS or your other sites.

### 3. Add the CNAME at DreamHost
- Panel → **Manage Websites** → `vaportrash.net` → **⋮ (3 dots)** → **DNS Settings**
- **Add Record**:
  - **Name / Host:** `sourdough`  (DreamHost appends `.vaportrash.net`)
  - **Type:** `CNAME`
  - **Value:** `<your-app>.fly.dev.`
- Also add any `_acme-challenge` CNAME / `_fly-ownership` TXT that `fly certs
  show` listed (for the SSL cert).

### 4. Wait + verify
DNS takes a few minutes to a few hours. When `fly certs show
sourdough.vaportrash.net` reports the certificate is issued, load
**https://sourdough.vaportrash.net**.

The app's session cookie is `Secure`; Fly serves HTTPS (`force_https = true`),
so logins work once the cert is live.
