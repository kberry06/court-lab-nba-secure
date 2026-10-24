# Court Lab NBA Secure

A deployable, private NBA research web application. Node 24 serves a responsive dashboard, runs 10,000-draw simulations in worker threads, and persists scenarios, odds, identifier mappings, audit records, simulation inputs/results and validation reports in SQLite. No runtime package dependencies.

**Status:** implemented, tested, published to [GitHub](https://github.com/kberry06/court-lab-nba-secure) and deployed at [Court Lab Secure](https://diamond-lab-mlb.onrender.com). NBA reuses Diamond's existing paid Render service and login; NFL is unchanged. The old hostname is retained. Public NBA schedule, roster, injury and box-score connectors are enabled, along with the owner-approved Odds API NBA connection. See [live-data workflow](docs/LIVE-DATA.md). The bundled fixture, generic player profiles and historical validation examples are synthetic, not current schedules, rosters, results or bookmaker prices. No accuracy or profitable-edge claim is made.

## Run

Requires Node 24 (tested with 24.19.0).

```sh
npm ci
npm test
npm start
```

Open http://127.0.0.1:3000. Default development mode is local-only and has no password. Set `APP_PASSWORD_HASH` to test sign-in locally. Set environment variables in your shell, or use Node's `--env-file=.env` option with a private `.env` copied from `.env.example` (npm start does not auto-load `.env`). Never expose the development configuration to the internet.

## Implemented

- Server-side 10,000-draw, seeded correlated game/player simulation; pace and shared team factors, lineup availability, minute reallocation, rest adjustment, heuristic player impact and overtime resolution.
- Mean/median and 10th/90th percentile score, margin, total and player points/rebounds/assists/minutes; Monte Carlo sampling uncertainty for home-win probability.
- Private username/password sign-in, salted scrypt password verification, opaque server-side sessions, 12-hour expiry, HttpOnly/SameSite cookies and Secure cookies in production. Production fails closed without secrets.
- Authenticated scenario, odds and mapping imports; atomic and idempotent quote persistence; precise decimal prices, UTC timestamps displayed in Australia/Sydney, stale quote and input flags.
- Moneyline, spread, total, points, rebounds, assists and PRA normalization; explicit reviewed provider mappings, unmatched-event quarantine, pregame/full-game/overtime restrictions, DNP void and push handling, model fair prices, synchronized two-sided no-vig probabilities and EV.
- Owner-approved Odds API integration for Sportsbet game markets and available per-event player props, with durable exact identifier mapping, quarantine and quota-conscious caching.
- Walk-forward calibration/evaluation of frozen pregame forecast records: expanding prior-settled calibration set, 24-hour embargo, regularized logistic calibration, Brier/log loss/accuracy, expanding home-win baseline, reliability bins, monthly folds, score/margin MAE and day-cluster bootstrap interval.
- Render Blueprint, persistent disk, health check, GitHub Actions CI, secret placeholders, tests and deployment/runbook documentation.

## Pending before real predictions

- Guaranteed licensed NBA feed availability and historical point-in-time lineup/injury snapshots. Current public-data integration provides schedules, current rosters and completed player logs; it does not establish a historical injury archive.
- Training/fitting the projection model and its covariance/dispersion on real NBA history. Current coefficients are explicit **heuristics**; simulation count does not establish accuracy.
- Full end-to-end walk-forward retraining of the projection model, player-prop calibration/coverage, untouched season holdout, timestamped closing-line comparison and settlement-rule-specific ROI analysis. The implemented backtest audits supplied frozen forecasts; it does not retrain the projection model.
- Sportsbet player-market availability depends on the approved Odds API subscription and the individual event. Empty or unsupported markets remain unavailable. No direct Sportsbet API is assumed, and there is no scraper.
- Automated off-host backup and restore verification; real-account authenticated live simulation acceptance. Render reports the NBA deployment live, and the public root redirects to the secure login. Local inherited-login/security smoke checks and GitHub CI pass. The separate repository is `kberry06/court-lab-nba-secure`; the NFL repository and service are unaffected.

## Documentation

- [Architecture and model limits](docs/ARCHITECTURE.md)
- [Secure deployment and recovery](docs/DEPLOYMENT.md)
- [Existing-service budget and rollback](docs/REUSED-SERVICE.md)
- [Data contracts, mapping and feed research](docs/DATA.md)
- [Validation protocol](docs/VALIDATION.md)

All durable runtime data stays on the server disk, outside Git. Only source, schemas/example fixtures and deployment configuration belong in the repository.
