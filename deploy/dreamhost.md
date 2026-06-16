# Deploying Sourdough to DreamHost shared hosting

Target: subdomain **sourdough.vaportrash.net** on a DreamHost **shared** plan,
served by Phusion Passenger.

> Shared hosting runs Node via Passenger with real memory limits and an old
> default Node. It works for a demo; for production-grade use, a DreamHost VPS
> removes most of this friction.

## One-time setup

### 1. Create the subdomain as a Passenger app
In the DreamHost panel → **Websites → Add a website / Manage** for
`sourdough.vaportrash.net`:
- Set the **web directory** to `sourdough.vaportrash.net/public`
  (Passenger uses `public/` as the doc root and the parent as the app root).
- Enable **Passenger** ("Passenger (Ruby/NodeJS/Python apps enabled)").
- Turn on **HTTPS** (free Let's Encrypt). **Required** — the login cookie is
  `Secure` in production and won't be sent over plain HTTP.

### 2. Install Node ≥ 22.5 over SSH (needed for `node:sqlite`)
```bash
ssh sshuser@yourserver.dreamhost.com
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24 && nvm alias default 24
which node          # copy this path for the next step
```

### 3. Point Passenger at that Node
Copy `deploy/dreamhost.htaccess` to the server doc root and edit the path:
```bash
# on the server
mkdir -p ~/sourdough.vaportrash.net/public
# put the file at ~/sourdough.vaportrash.net/public/.htaccess with:
#   PassengerNodejs /home/YOURUSER/.nvm/versions/node/vXX/bin/node
#   PassengerAppEnv production
```

## Deploy (every time)

From the project root on the Pi:
```bash
REMOTE=sshuser@yourserver.dreamhost.com ./deploy.sh
```
This syncs the source up, runs `npm ci && npm run build` on the server, and
restarts Passenger (`tmp/restart.txt`). First load creates + migrates + seeds
`data/sourdough.db` under the app dir (not web-accessible).

If the server build is killed by memory limits, use the **local-build fallback**
documented at the bottom of `deploy.sh`.

## After first deploy
- Visit https://sourdough.vaportrash.net — sign up or log in.
- The seed includes an admin demo account (`demo@sourdough.dev` / `password`).
  **Change or remove it** before real use (sign up your own, delete the demo
  user, or disable `seedIfEmpty` in `lib/db/sqlite.ts`).

## Gotchas
- **Node version**: if Passenger ignores `PassengerNodejs`, it's running the
  system Node — `node:sqlite` will be missing and the app won't boot. Verify the
  path and that `which node` ≥ v22.5.
- **Memory**: `next build` is the heavy step; build locally if the server kills it.
- **Restart**: any change requires `touch ~/sourdough.vaportrash.net/tmp/restart.txt`
  (deploy.sh does this).
- **Data persistence**: `data/` is excluded from rsync, so deploys never wipe
  your database.
