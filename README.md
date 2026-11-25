# Court Lab NBA Secure

A deployable, private NBA research web application. Node 24 serves a responsive dashboard, runs 10,000-draw simulations in worker threads, and persists scenarios, odds, identifier mappings, audit records, simulation inputs/results and validation reports in SQLite. No runtime package dependencies.

**Status:** implemented, tested, published to [GitHub](https://github.com/kberry06/court-lab-nba-secure) and deployed at [Court Lab Secure](https://diamond-lab-mlb.onrender.com). NBA reuses Diamond's existing paid Render service and login; NFL is unchanged. The old hostname is retained. Public NBA schedule, roster, injury and box-score connectors are enabled, along with the owner-approved Odds API NBA connection. See [live-data workflow](docs/LIVE-DATA.md). The bundled fixture, generic player profiles and historical validation examples are synthetic, not current schedules, rosters, results or bookmaker prices. Historical research metrics are reported; live accuracy and a profitable edge remain unestablished.

## Run

Requires Node 24 (tested with 24.19.0).

```sh
npm ci
npm test
npm start
```

Open http://127.0.0.1:3000. Default development mode is local-only and has no password. Set `APP_PASSWORD_HASH` to test sign-in locally. Set environment variables in your shell, or use Node's `--env-file=.env` option with a private `.env` copied from `.env.example` (npm start does not auto-load `.env`). Never expose the development configuration to the internet.

## Implemented

- Server-side 10,000-draw, seeded game/player simulation. Complete bundles use a historically fitted opponent/rest classifier, total regression and correlated full-game distributions; lineup availability, minute reallocation and player impacts remain assumptions. A labelled recent-score fallback remains available.
- Mean/median and 10th/90th percentile score, margin, total and player points/rebounds/assists/minutes; Monte Carlo sampling uncertainty for home-win probability.
- Recent player performance charts include a selected-market reference line, last-five over/under/equal counts, Sportsbet quote timestamps/staleness, alternate available lines and manual entry. Comparisons use the selected current threshold for each past performance; historical bookmaker lines are not inferred. Points, assists, rebounds and PRA use matching imported markets when present; unsupported combinations retain manual entry.
- Private username/password sign-in, salted scrypt password verification, opaque server-side sessions, 12-hour expiry, HttpOnly/SameSite cookies and Secure cookies in production. Production fails closed without secrets.
- Authenticated scenario, odds and mapping imports; atomic and idempotent quote persistence; precise decimal prices, UTC timestamps displayed in Australia/Sydney, stale quote and input flags.
- Moneyline, spread, total, points, rebounds, assists and PRA normalization; explicit reviewed provider mappings, unmatched-event quarantine, pregame/full-game/overtime restrictions, DNP void and push handling, model fair prices, synchronized two-sided no-vig probabilities and EV.
- Owner-approved Odds API integration for Sportsbet game markets and available per-event player props, with durable exact identifier mapping, quarantine and quota-conscious caching.
- Walk-forward calibration/evaluation of frozen pregame forecast records: expanding prior-settled calibration set, 24-hour embargo, regularized logistic calibration, Brier/log loss/accuracy, expanding home-win baseline, reliability bins, monthly folds, score/margin MAE and day-cluster bootstrap interval.
- Eight-season public ESPN regular-season archive (2018–19 through 2025–26): 9,519 deduplicated final games, all 30 teams each season, exact season/team coverage checks, Cup title exclusions and neutral-site restart correction. A separate Elo/form game baseline is selected on prior seasons and evaluated across 8,289 held-out games. The secure Model validation screen serves the compact report; this is not validation of the live game/player simulator.
- Eight-season SportsDataverse/hoopR player-boxscore import: source-pinned checksums, durable ESPN player/game/team IDs, PTS/REB/AST/minutes, observed DNPs, row quarantine and team-score reconciliation. After checking 148 suspect games against ESPN summaries, the research archive retains 245,438 player-game rows from 9,486 games; 33 unresolved games are excluded. See [data attribution](DATA-ATTRIBUTION.md).
- Nested chronological model research on 7,230 paired game forecasts and 153,620 conditional player appearances. Game probabilities improve Brier/log loss over the earlier baseline; player recency/shrinkage lowers component errors. Trained artifacts feed fresh projections after their historical gates pass, with cutoff checks and automatic regeneration of old model versions. Each version freezes its first forecast per game for prospective evaluation. See [measured accuracy and limits](docs/ACCURACY-RESEARCH.md).
- Final-allocation research audit: 7,222 chronological plug-in game replays and 72 paired 10,000-draw simulations. Reports final minute/score allocation, participation error, interval coverage and player-pool omissions. The candidate remains research only; player-prop confidence is held Low pending calibration. Matchup refreshes now archive compact roster/injury observations with observed/received timestamps for future as-of evaluation. See [allocation evidence](docs/ALLOCATION-RESEARCH.md).
- Render Blueprint, persistent disk, health check, GitHub Actions CI, secret placeholders, tests and deployment/runbook documentation.

- Joint rotation research, nine separate market-family calibration diagnostics, reviewed pregame evidence imports, and immutable matched-time quote/forecast settlement tracking. The candidate was not promoted; historical injury reconstruction and forward validation remain incomplete. See [this accuracy stage](docs/NEXT-ACCURACY.md).

- Recent live performance report using original saved pregame forecasts, complete player-box audits and a paired last-five benchmark; manual prediction refresh reloads roster/injury and recent player inputs. See [live performance](docs/LIVE-PERFORMANCE.md).

- Updated role-based minute budgets and history-based minute uncertainty for new matchups, with a 72-game paired allocation audit and separate forward model version. Player props remain uncalibrated. See [minute model evidence and limits](docs/MINUTE-MODEL.md).

- Explicit 1.5-minute MAE target audit on 153,620 appearances; the richer conditional-role candidate misses the target and is withheld. Fresh matchup snapshots retain earlier starter, explicit DNP and minute facts for further modelling. See [minute target evidence](docs/MINUTE-TARGET.md).

- A 4.5-minute final-allocation acceptance gate, nonlinear role/participation experiments and separate forward shadow forecasts. The strongest paired result is 4.83 minutes; the gate remains unmet and the displayed default is retained. See [4.5-minute evidence and shadow operation](docs/MINUTES-45.md).

## Pending validation and integrations

- Guaranteed licensed NBA feed availability and historical point-in-time lineup/injury snapshots. Current public-data integration provides schedules, current rosters and completed player logs; it does not establish a historical injury archive.
- Fitting lineup/transaction impacts, player covariance and prop distribution tails, plus broader validation of final allocated player scores with verified pregame inputs after the first proxy-roster audit. Player component MAE does not establish accuracy of final simulated props.
- Accumulating and validating real prospective outcomes, completing verified historical lineup/injury coverage, promoting market-family calibration only after forward evidence, and timestamped closing-line/settlement-rule-specific ROI analysis. All historical seasons have already been inspected and are labelled reused research; future frozen forecasts provide the next untouched test.
- Sportsbet player-market availability depends on the approved Odds API subscription and the individual event. Empty or unsupported markets remain unavailable. No direct Sportsbet API is assumed, and there is no scraper.
- Automated off-host backup and restore verification; real-account authenticated live simulation acceptance. Render reports the NBA deployment live, and the public root redirects to the secure login. Local inherited-login/security smoke checks and GitHub CI pass. The separate repository is `kberry06/court-lab-nba-secure`; the NFL repository and service are unaffected.

## Documentation

- [Architecture and model limits](docs/ARCHITECTURE.md)
- [Secure deployment and recovery](docs/DEPLOYMENT.md)
- [Existing-service budget and rollback](docs/REUSED-SERVICE.md)
- [Data contracts, mapping and feed research](docs/DATA.md)
- [Validation protocol](docs/VALIDATION.md)
- [Trained model accuracy, comparisons and limitations](docs/ACCURACY-RESEARCH.md)
- [Final allocation and participation audit](docs/ALLOCATION-RESEARCH.md)

Historical research can be reproduced with `npm run history:refresh` (game import, player import/audit, game replay), or the individual `history:fetch`, `history:players` and `history:backtest` commands. Importers use public published assets or bounded cached ESPN JSON requests and stop on access restrictions. Public accessibility does not imply an open redistribution licence; upstream attribution is recorded. Raw responses and per-game replay data stay in ignored `data/raw/` and `data/generated/`. Source manifests and compact derived `model-artifact.json` / `player-history-artifact.json` are versioned, with archive/asset checksums, coverage and evaluation evidence. The Docker image bundles these reports, so displaying them needs no external requests. Runtime secrets and SQLite data stay outside Git.


### Automatic forward validation (November 2026)

The existing production process runs a serial collection check 15 seconds after startup and every five minutes. It reads the public schedule with the existing 30-minute cache, prepares scheduled games within the next 24 hours, and captures a second observation within 90 minutes of tip-off. Each capture stores the default and a linked research shadow from the same input bundle. Interactive preparation uses the same path. Default forecasts and existing first-per-version forecasts remain immutable; shadow runs never replace displayed predictions or enter sportsbook calibration. No extra Render resource or Odds API request is required.

Capture receipts, failed attempts and collection status live in the existing SQLite data cache on the persistent disk. Failed inputs retry after 15 minutes; unresolved finals retry after 30 minutes, in bounded batches of eight. Games within five minutes of tip-off are not newly captured, and missed games are reported rather than regenerated. Checks pause while a user calculation is running. A process outage can still miss games: the collector runs only while the existing single-instance service is running. Inspect the last successful check and missing/missed coverage in Model validation or authenticated `/api/research/collection`. `FORECAST_COLLECTION_ENABLED=false` disables the production loop. Development/test instances do not start it unless `autoCollect:true` is explicitly passed to `createApp`.

`/api/research/performance?days=30` also returns a minutes-error audit and paired shadow statistics. Paired scores join each shadow to its actual linked default run, require matching input observation/player identities and less than two minutes between captures, and use identical observed positive-appearance cases. The first eligible pair per event is retained for reporting. Aggregate first-per-model results are a separate descriptive report, not a matched-time comparison. At least 100 settled paired games, acceptable missing-data coverage, uncertainty assessment, minute MAE at most 4.5 and no point-error regression are required before any manual promotion review. The endpoint never automatically promotes a model.

The minutes audit shows largest misses, recent observed starting roles, recent minute changes, sparse/stale history, listed injuries, reduced assumed availability and separate DNP errors. These are overlapping descriptive groups, not causal diagnoses or verified pregame injury/transaction reconstruction. Missing actual players and missing conditional forecasts remain excluded and counted; uncalibrated props stay Low confidence.


### Joint rotation candidate v2

`minute-shadow-rotation-2` retains the earlier-season role learner and balanced participation priors, then uses dependent Bernoulli rounding to keep rotation size within one of its expected count. Input participation mass below five rejects the candidate; it never activates confirmed outs to fill a lineup. Each selected participant gets at least 0.1 minute, with a maximum of 48. A constrained weighted least-squares budget distributes corrections according to squared pregame minute uncertainty, so stable roles absorb less adjustment. The lineup-impact reference is the feasible expected-minute allocation, rather than the all-active role budget.

The candidate has its own collector receipts, run version and matched-pair report. Existing balanced-model forecasts remain immutable and separately graded; current-pair results cannot select an older shadow version. Historical research is reproduced with `node scripts/audit-joint-minutes.js` and the fixed protocol in `experiments/minutes-joint-rotation-v2.json`. Both roster pools use the same 72-game sample as earlier research, so this is a reused historical diagnostic, not a fresh validation set. See `minute-joint-artifact.json` for final allocated errors and the blocked promotion gate. No default-model switch or injury-feed integration occurs in this change. Player props remain uncalibrated and Low confidence.


### Full-storage recovery

Large feed-cache JSON entries are stored losslessly as gzip/base64 with a versioned prefix. Legacy plain JSON remains readable. On startup, existing large plain cache rows are compressed in place using individual atomic SQLite updates, with journal checkpoints between rows. Forecasts, results, odds, evidence, input snapshots and sessions are not deleted or rewritten by this migration. Freed database pages are reused; the main database file need not immediately shrink. Journal checkpoints are kept small to preserve write headroom.

A collector status write failure, including SQLITE_FULL/ENOSPC, is caught and reported in memory even when the error status cannot be persisted. The collector releases its running flag and retries on the normal interval; it cannot terminate the web process through an unhandled rejection. Recovery logs report byte counts only. Existing gzipped caches require this decoder, so a rollback must retain cache-format support.


### Recent player review and back-to-back games

The Player performance chart now loads a separate review-only history on player selection, checks again every five minutes while the matchup page is visible, and offers Refresh recent stats to bypass the cache. It uses a five-minute cache for player logs, team schedules and recent final summaries. The latest three team finals are checked against complete reconciled boxes, which can supply a newly completed game before the athlete log catches up. In-progress/future games are excluded; missing/incomplete boxes are flagged, and DNPs are not converted into positive performances. Dates and observation times display in Sydney time.

This review feed has no 24-hour historical embargo and does not mutate stored scenarios, forecast inputs, model outputs or evaluation records. The chart shows both the latest review check time and original forecast input time. Existing prediction/replay paths still impose their 24-hour cutoff and six-hour history-cache policy; changing live model input availability requires a separately versioned and evaluated change. Availability of final stats remains dependent on the public provider publishing them.

### Player count-distribution challenger

`player-count-shadow-1` addresses under-dispersed player-stat distributions. It retains the exact linked incumbent game-score draws and the joint rotation candidate's player minutes. Points are allocated as integer counts that sum to each team's score. Rebounds and assists use Poisson counts with joint lognormal rate variation fitted from earlier-season conditional rate residuals. The covariance fit removes the Poisson variance contribution and preserves learned cross-stat dependence; it is not a fitted live probability calibrator. Confirmed outs remain out. Experimental samples are consumed inside the worker, and only compact summaries are returned and stored.

Reproduce with `node scripts/prepare-count-replay.js` then `node scripts/research-count-model.js`. The audited historical archives and earlier-season minute learners must already exist locally. Every replay season uses only earlier-season count parameters. The final runtime parameter file is fitted through the archived 2025–26 season for future forecasts, not retrospectively applied to those games. See `experiments/player-count-v1.json`, `player-count-model.json` and `player-count-research-artifact.json` for the fixed protocol, training provenance and full results.

The 60-game reused historical diagnostic covers 1,203 paired positive appearances. Points MAE is 4.49 incumbent versus 4.47 challenger; the paired interval includes no improvement. Points central-80% coverage improves from 62.4% to 78.8%, and fixed-threshold points Brier from 0.09267 to 0.08647. Historical minute MAE remains 4.78, above the 4.5 gate. Rebound and assist ranges are conservative, and assist mean error slightly worsens. This is evidence for a forward challenger, not promotion or a claim of betting accuracy.

Fresh matchup preparation saves both research versions separately from the displayed default. Collector receipts require the new challenger as well, retry partial comparisons, and never reconstruct missed pregame predictions. The existing secured `/api/research/count-challenger?days=7` route returns research results, capture counts and the same-input forward comparison. The regular live-performance report also evaluates its frozen forecasts under its own model version. At least 100 independent future paired games, no point-error regression and market-family reliability review are required; no automatic promotion or live calibration is enabled.

### Official injury review and probability reliability

New observations discover the latest published PDF link on the public NBA injury-report page, download only that official NBA-hosted PDF, verify the file hash and matching Eastern publication timestamp, and extract its bounded, recognized table layout in a timed subprocess. The Docker image installs Debian's Python/pdfplumber packages. No credentials or bookmaker scraping are involved. A 403, changed layout, future/ambiguous publication timestamp, missing team submission, unmatched player or wrong event/date produces an explicit review state. Player mapping is exact within the current team's durable roster IDs, with punctuation/diacritic normalization; no fuzzy cross-team matches are accepted. A report omitting a player does not prove participation or a confirmed starting role.

Roster observations have a five-minute cache. The existing collector checks hourly when more than six hours out, every fifteen minutes in the six-hour window, and every five minutes in the final ninety minutes, with a ninety-second pre-tip calculation buffer. These are check opportunities on one serial worker; they are not a delivery-time guarantee. A compact clinical fingerprint excludes publication-only changes. Unchanged assumptions receive separately timestamped confirmations; a changed status/roster, newly available team final, changed candidate version or six-hour input age rebuilds the projection. This avoids repeating large simulations and odds payloads for every source check. Original saved forecast inputs are not rewritten. Changed or failed checks invalidate the shortlist immediately until its matching projection and source evidence are available.

Shortlists require game-specific official coverage, recent source receipts, and a sufficiently recent publication (ninety minutes inside six hours of tip, three hours earlier). Unresolved twenty-minute rotation players, identified restrictions and source conflicts hold the whole game, since teammates' roles also depend on them. Confirmed outs remain out; an official Available/roster Out conflict is held for review rather than silently activating the player. Fixed Questionable/Probable appearance assumptions remain unvalidated and are not described as measured participation probabilities. The feed does not provide confirmed starting lineups or a complete minutes-restriction archive.

New live source bundles tag all forecast versions with `-injury-1` so their results stay separate from earlier inputs. All uncalibrated market families now remain Low confidence; selection cards label percentages as raw, unvalidated estimates. No 80% or 90% hit-rate claim is enabled. Existing saved probabilities and results are preserved. A protected `/api/research/reliability?days=7&minimum=0.9&side=under` report filters before its record cap, evaluates matched frozen quotes by model/family/side, separates missing results, voids and pushes, and discloses truncation. It includes alternate/legacy unknown-main thresholds and cannot reconstruct the exact old displayed cards. Model validation exposes this report with an over/under selector. Private startup logs contain bounded aggregate diagnostic results, without credentials or individual player selections.

New prospective records retain provider market/main-line provenance; legacy missing fields stay unknown. The selections-slate route saves immutable, deduplicated snapshots of each nonempty generated shortlist, its input/official-report provenance and quoted main-line selections for future audits. Snapshot counts are not bet counts or independent observations. Historical pregame injury/transaction reconstruction and independent market-family calibration remain pending; this source-quality change does not establish improved hit rates.
