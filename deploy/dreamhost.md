# Deploying Sourdough to DreamHost shared hosting

Target: subdomain **sourdough.vaportrash.net** on a DreamHost **shared** plan,
served by Phusion Passenger.

> Shared hosting runs Node via Passenger and **blocks V8's JIT**, so a plain
> `node` crashes at startup (`SetPermissions ... ENOMEM`). The fix is to run Node
> with `--jitless` everywhere. The setup script below handles that for you. For
> production-grade use, a DreamHost VPS removes this friction entirely.

## Fastest path: the setup script

The code is already a git repo on the server, so:

```bash
ssh sshuser@yourserver.dreamhost.com
# one-time: install Node >= 22.5 if you haven't
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc && nvm install 24 && nvm alias default 24

cd ~/sourdough.vaportrash.net
git pull
bash deploy/dreamhost-setup.sh      # builds with --jitless, writes Passenger config, restarts
```

Then do the panel steps in step 1 below (web directory → `/public`, enable
Passenger, enable HTTPS) and load the site. The rest of this doc is the manual
breakdown of what the script does.

## One-time setup (manual breakdown)

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

### 3. Point Passenger at a `--jitless` Node wrapper
Because the host blocks V8's JIT, Passenger must launch Node with `--jitless`.
Create a wrapper and reference it from the doc-root `.htaccess`:
```bash
# on the server
mkdir -p ~/bin
printf '#!/bin/bash\nexec "%s" --jitless "$@"\n' "$(which node)" > ~/bin/node-jitless
chmod +x ~/bin/node-jitless

mkdir -p ~/sourdough.vaportrash.net/public
# put this at ~/sourdough.vaportrash.net/public/.htaccess:
#   PassengerNodejs /home/YOURUSER/bin/node-jitless
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
- **JIT is blocked**: a plain `node` crashes here (`SetPermissions ... ENOMEM`).
  Everything must run via `--jitless` — the wrapper handles runtime, and the
  build uses `NODE_OPTIONS=--jitless`. If you see that V8 crash, something ran
  Node without the flag.
- **Node version**: if Passenger ignores `PassengerNodejs`, it's running the
  system Node — `node:sqlite` will be missing and the app won't boot. Verify the
  path and that `which node` ≥ v22.5.
- **Memory**: `next build` is the heavy step; build locally if the server kills it.
- **Restart**: any change requires `touch ~/sourdough.vaportrash.net/tmp/restart.txt`
  (deploy.sh does this).
- **Data persistence**: `data/` is excluded from rsync, so deploys never wipe
  your database.
