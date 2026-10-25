# Participation, evidence and calibration stage

This stage adds research and prospective measurement infrastructure. It does not promote a new live player model or calibrated Sportsbet probabilities. Uncalibrated player props remain Low confidence.

## Joint participation and minutes

`node scripts/research-advanced.js` replays 72 paired games (12 deterministic game-ID selections per season, 2021–2026), using 10,000 draws per model/game. Complete prior team rotations are sampled together, preserving observed participation/minute dependence. Templates use a 20-game window and six-game half-life. A 5% independent support component was added after an initial diagnostic exposed zero-support players; this is explicitly reused research, not an untouched holdout. The protocol is recorded in `experiments/advanced-v1.json` and the artifact includes source/code hashes.

| Metric | Baseline | Joint research candidate |
|---|---:|---:|
| Playing-player points MAE | 4.554 | 4.788 |
| Playing-player minutes MAE | 5.526 | 5.608 |
| Participation Brier (lower better) | 0.1703 | 0.1318 |
| Central 80% points interval coverage | 45.7% | 61.4% |

Both models use the same 1,738 listed-player cases and 1,442 positive appearances. The candidate improves participation and interval coverage but worsens point/minute errors; even its coverage is below 80%. It is not promoted. Pools remain prior-box-score roster proxies, with omissions documented in the preceding allocation audit. Current injuries and transactions cannot be recovered from these proxies.

## Historical pregame evidence

The append-only evidence contract stores effective time, source availability time, actual receipt time, source URL/checksum, rights basis and publication-verification status. Live as-of reads require receipt before the cutoff. Historical reconstruction additionally requires verified publication timing. A roster needs a complete prior anchor; only transactions known by the cutoff can modify it. Later published transactions are excluded.

An official NBA injury-report PDF pilot dated 4 March 2026, 05:15 Eastern was parsed and mapped: 30 player designations and 23 team-level “not yet submitted” rows. Missing reports are not healthy rosters. The PDF header and layout were checked, but historical delivery timing is not independently verified: **zero pilot rows qualify for historical as-of backtesting**. Multi-season publication verification, roster anchors and transaction coverage remain pending. Raw PDFs and player-level medical records stay in ignored local data directories; only a source/coverage summary is versioned.

Reproduce the local pilot with `scripts/extract-injury-pdf.py` and `node scripts/import-injury-pilot.js` using the documented official PDF. Reviewed evidence can be imported into the secure dashboard or POSTed to `/api/research/evidence/import`. Import time is assigned by the server; clients cannot backdate receipt.

## Market-family calibration

Spreads, totals and seven player prop families have separate regularized logistic calibrators. Diagnostic experiments fit earlier seasons and score later seasons, using fixed thresholds rather than invented historical bookmaker prices. Alternate thresholds are weighted within event/player/family. The compact report shows raw/calibrated Brier scores and reliability bins. These are diagnostics on reused seasons and proxy inputs; they are not Sportsbet calibration evidence.

Live candidate fits require at least 100 independent games and 500 decisive selections per model/family. Reaching these minimums only creates a candidate: forward validation remains required, and every fit currently has `eligibleForLive: false`.

## Matched-time forward comparison

Real simulation requests freeze approved-provider quotes already received, observed within 15 minutes, alongside a fingerprint of the model and the matching input snapshot. The first forecast per model/event/selection/line/time bucket is immutable. Adjusted scenarios, manual imports, demo games, future quotes and missing/stale input evidence cannot enter acceptance calibration. Quote and input clocks are preserved; later refreshes cannot rewrite earlier forecasts.

`GET /api/research/prospective` reports matched model/bookmaker Brier scores by family and model fingerprint. A paired bookmaker probability exists only for synchronized two-sided prices. Alternate lines are case weighted; profit is descriptive, not an independent betting test. Family fitting chooses the available capture nearest 60 minutes before tip using metadata, never outcomes.

`POST /api/research/settle` checks up to eight recorded events against complete final public box scores. Team totals must reconcile. Pushes and explicit DNP voids are separate; missing players and rescheduled games remain unresolved. Outcome corrections are appended and as-of readable. The Model validation page exposes the report and a “Check final results” action. Settlement is on demand; an unattended scheduler and a sufficiently large untouched forward sample remain pending.

SQLite migrations are additive, and the existing persistent disk is reused. No new Render resources or credentials are required. Automated tests cover future-data exclusion, publication gates, joint rotation bounds, family separation, immutable forecasts/corrections, matched API capture, and incomplete-result rejection.
