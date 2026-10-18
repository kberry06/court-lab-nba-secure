# GitHub → Render secure deployment

Existing account context from Gridiron Lab: GitHub owner `kberry06`, NFL repository `gridiron-lab-nfl`, Render NFL secure service `gridiron-lab-nfl-secure`. NBA reuses the existing paid Diamond service; NFL is unaffected. See [current service and rollback](REUSED-SERVICE.md). Do not create another service within the current budget.

## Source publication

Source is published at `kberry06/court-lab-nba-secure`. GitHub reported this user-created repository as public at publication; the application itself is protected by login. Repository visibility can be changed separately in GitHub settings. Never add `.env`, SQLite files, credentials, session files or licensed datasets to Git. Uploads were performed through the authorised GitHub connector.

Protect `main` with required CI checks and pull-request review. CI installs from the lockfile, checks syntax and runs automated tests. Render's `autoDeployTrigger: checksPass` delays deployments until linked GitHub checks pass. Initial Blueprint creation still needs a verified first deployment.

## Current hosting configuration

The existing Diamond Blueprint in `kberry06/diamond-lab-mlb/render.yaml` is the infrastructure source of truth. Its `repo` points to `kberry06/court-lab-nba-secure`, branch `main`, with `autoDeployTrigger: checksPass`. The service retains its existing Docker runtime, Starter compute plan, 1 GB disk at `/data` and `/healthz` check. The NBA Dockerfile starts `deploy/reuse-service.mjs`, using `/data/court-nba` for SQLite and the existing Diamond sign-in credentials in memory. MLB files are retained and its web application is inactive. The inherited odds key remains unused in manual mode.

URL: https://diamond-lab-mlb.onrender.com. The old hostname is retained to preserve the existing service. Base hosting cost is unchanged; usage overages follow existing Render account terms. Automated off-host backups and a production restore exercise remain pending.

## Optional future standalone provisioning (adds cost)

The following instructions and variable table apply only to a separately authorised new service. They are not the current deployment configuration.

1. In the same Render workspace as Gridiron Secure, create a Blueprint from the NBA repository and `render.yaml`.
2. Review the paid Node service and 1 GB persistent disk before accepting provisioning charges. Persistent disk services cannot use free hosting and do not provide zero-downtime deploys. The selected region is Singapore; Sydney is the display timezone, not the server region.
3. The Blueprint generates `APP_PASSWORD` and `ADMIN_TOKEN` within Render. Do not paste their values into chat or GitHub files. Username is `admin`; retrieve the generated password from the service's Environment page when signing in.
4. Deploy, check `/api/health`, verify `/` redirects to `/login` before sign-in, then verify an authenticated simulation and saved result across a restart.

| Variable | Configuration |
|---|---|
| `APP_USERNAME` | `admin`; configurable in Render |
| `APP_PASSWORD` | Platform-generated random login secret; hashed with scrypt in server memory |
| `APP_PASSWORD_HASH` | Optional precomputed salted scrypt hash; overrides `APP_PASSWORD` |
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

The default platform-generated password requires no local password creation. If you prefer to supply a hash instead, `node src/password-hash.js` accepts a unique password on stdin and prints a salted scrypt hash. Feed it from a password manager in a trusted local terminal without including plaintext in command arguments/history. Save only the resulting hash as `APP_PASSWORD_HASH` in Render. Changing the stored hash invalidates existing sessions. With the default generated `APP_PASSWORD` configuration, a fresh in-memory salt also invalidates sessions after each server restart; sign in again after deployment.

The dashboard accepts browser sessions. The admin token exists for scripted POSTs; GET data requires a browser session. Login sessions last at most 12 hours and their tokens are stored on disk in hashed form. Cookies are HttpOnly, SameSite=Strict and Secure in production. HTTPS is terminated by Render. `/api/health` intentionally exposes only `{ok:true}`.

## Persistence, backup and recovery

SQLite runs in WAL mode with foreign-key enforcement and atomic quote batches. Tables hold scenarios, quotes, mappings, immutable run inputs/summaries, reports, sessions and an audit trail. Migrations currently have schema version 1; future releases must supply incremental migrations. The disk persists through deploys. Never scale this service horizontally while using SQLite.

Render disk snapshots are infrastructure recovery, not the sole database-consistent backup. Before production use, configure a daily SQLite online backup (`node:sqlite` backup API or SQLite `.backup`) to a separate approved storage destination; encrypt and retain it according to data licence terms. Do not copy only the live `.sqlite` file while WAL writes are active. Automated off-host backup is **pending** because no destination/credentials were supplied.

Recovery: stop writes, obtain a consistent backup, restore into an empty data directory, start a single instance, check health, row counts, latest quote timestamps and a deterministic saved scenario, then enable writes. Test restoration before enabling a live feed. Keep secrets out of backups where possible; existing session rows can be discarded on restore.

## Operational limits

The private MVP has process-local write and login limits. Render may proxy many users through the same socket address, so rate limits are intentionally conservative and can apply globally. Do not trust arbitrary forwarded IP headers. Move limits to a trusted shared store before scaling. There is no scheduled provider polling; manual authenticated fetch/import is the supported MVP path. Add a monitored scheduler only after licensing, quota and freshness requirements are agreed.

Official references verified during build: [Blueprint specification](https://render.com/docs/blueprint-spec), [persistent disks](https://render.com/docs/disks), [deploys and CI checks](https://render.com/docs/deploys).
