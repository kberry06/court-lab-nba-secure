# NBA replaces the inactive MLB application

User decision: deactivate Diamond Lab and use its existing paid Render service for NBA. No additional service, disk, larger compute plan or subscription is authorised. NFL is unchanged.

Existing Render service: `srv-d9th1lijobas73cvl4ig`, Hobby Time workspace, Singapore, legacy Starter plan, 1 GB disk mounted at `/data`. Change only the source repository to `kberry06/court-lab-nba-secure` and display name if supported; retain its Docker runtime, plan, disk and `/healthz` health-check path.

The Docker entrypoint runs only NBA. It stores NBA records in `/data/court-nba` and leaves all MLB files untouched. Existing `DIAMOND_ACCESS_USER` and `DIAMOND_ACCESS_PASSWORD` are read only in process memory to retain the owner's login; secrets are never retrieved into chat, logs or Git. Optional `APP_USERNAME` and `APP_PASSWORD_HASH` / `APP_PASSWORD` can override them later. NBA has its own session cookie. The inherited sportsbook key is not enabled: `ODDS_PROVIDER=manual` and `ODDS_FEED_APPROVED=false` keep NBA ingestion manual until separately approved.

MLB automation and web routes no longer run. Historical MLB data remains available for next season. Roll back by restoring the Diamond repository and its previously live revision; leave all disk files in place. Do not delete the Render service or volume as part of deactivation.

The standalone `render.yaml` is an optional future new-service configuration. Do not apply it for this reused-service deployment: it would provision a second paid service. Current monthly base compute/disk cost stays the same; bandwidth and build overages still follow the existing account's usage rules.
