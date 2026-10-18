# GitHub → Render secure deployment

Existing account context from Gridiron Lab: GitHub owner `kberry06`, NFL repository `gridiron-lab-nfl`, Render NFL secure service `gridiron-lab-nfl-secure`. Create the NBA service separately so NFL operation is unaffected. The requested hosting destination is Render, not Sites.

## Source publication

Create a private repository (suggested `kberry06/court-lab-nba-secure`), then push this complete project root. The supplied local repository can be connected once access is available. Never add `.env`, SQLite files, credentials, session files or licensed datasets to Git. Local browser access to GitHub was declined during this build, so no external repository changes were made.

Protect `main` with required CI checks and pull-request review. CI installs from the lockfile, checks syntax and runs automated tests. Render's `autoDeployTrigger: checksPass` delays deployments until linked GitHub checks pass. Initial Blueprint creation still needs a verified first deployment.

## Provisioning

1. In the same Render workspace as Gridiron Secure, create a Blueprint from the NBA repository and `render.yaml`.
2. Review the paid Node service and 1 GB persistent disk before accepting provisioning charges. Persistent disk services cannot use free hosting and do not provide zero-downtime deploys. The selected region is Singapore; Sydney is the display timezone, not the server region.
3. Set the secrets below in Render. Do not paste secrets into chat or GitHub files.
4. Deploy, check `/api/health`, verify `/` redirects to `/login` before sign-in, then verify an authenticated simulation and saved result across a restart.

| Variable | Configuration |
|---|---|
| `APP_USERNAME` | Your chosen login name; configure in Render |
| `APP_PASSWORD_HASH` | Salted scrypt hash, required in production |
| `ADMIN_TOKEN` | Auto-generated secret, minimum 24 characters, for API writes/automation |
| `DATA_DIR` | `/var/data`, on the mounted persistent disk |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.19.0` |
| `HOST` | `0.0.0.0` |
| `PORT` | Supplied by Render |
| `TZ` | `Australia/Sydney` |
| `ODDS_PROVIDER` | `manual` until approved; then `the-odds-api` |
| `ODDS_FEED_APPROVED` | `false` until contractual rights and coverage are verified |
| `ODDS_API_KEY` | Render secret only; leave unset for manual mode |

Use a unique password (at least 16 characters); do not copy Gridiron credentials. `node src/password-hash.js` accepts the password on stdin, then prints a salted scrypt hash. Feed it from a password manager in a trusted local terminal without including the plaintext in a command argument/history. Save only the resulting hash in Render. The script never writes a file. Clear the terminal afterward. Changing the stored hash invalidates all existing sessions.

The dashboard accepts browser sessions. The admin token exists for scripted POSTs; GET data requires a browser session. Login sessions last 12 hours and persist on disk in hashed form. Cookies are HttpOnly, SameSite=Strict and Secure in production. HTTPS is terminated by Render. `/api/health` intentionally exposes only `{ok:true}`.

## Persistence, backup and recovery

SQLite runs in WAL mode with foreign-key enforcement and atomic quote batches. Tables hold scenarios, quotes, mappings, immutable run inputs/summaries, reports, sessions and an audit trail. Migrations currently have schema version 1; future releases must supply incremental migrations. The disk persists through deploys. Never scale this service horizontally while using SQLite.

Render disk snapshots are infrastructure recovery, not the sole database-consistent backup. Before production use, configure a daily SQLite online backup (`node:sqlite` backup API or SQLite `.backup`) to a separate approved storage destination; encrypt and retain it according to data licence terms. Do not copy only the live `.sqlite` file while WAL writes are active. Automated off-host backup is **pending** because no destination/credentials were supplied.

Recovery: stop writes, obtain a consistent backup, restore into an empty data directory, start a single instance, check health, row counts, latest quote timestamps and a deterministic saved scenario, then enable writes. Test restoration before enabling a live feed. Keep secrets out of backups where possible; existing session rows can be discarded on restore.

## Operational limits

The private MVP has process-local write and login limits. Render may proxy many users through the same socket address, so rate limits are intentionally conservative and can apply globally. Do not trust arbitrary forwarded IP headers. Move limits to a trusted shared store before scaling. There is no scheduled provider polling; manual authenticated fetch/import is the supported MVP path. Add a monitored scheduler only after licensing, quota and freshness requirements are agreed.

Official references verified during build: [Blueprint specification](https://render.com/docs/blueprint-spec), [persistent disks](https://render.com/docs/disks), [deploys and CI checks](https://render.com/docs/deploys).
