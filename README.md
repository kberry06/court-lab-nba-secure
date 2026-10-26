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
