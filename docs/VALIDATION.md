# Accuracy and validation protocol

The application now includes two evaluations: a retrospective eight-season **game-results baseline replay**, and a separate **walk-forward audit of frozen forecast records**. Neither validates the current live player simulator. The synthetic report remains a functional check only.

The subsequent trained release adds nested game-model selection and a conditional player-component evaluation. Its fitted artifacts now feed fresh complete-data projections after historical gates pass. [Current accuracy research](ACCURACY-RESEARCH.md) reports those comparisons, the modest winner hit-rate change, probability-quality improvement, interval coverage and remaining limits. The original baseline evidence below remains available for comparison.

## Eight-season game baseline

Run `npm run history:fetch` and `npm run history:backtest`. ESPN season years 2019–2026 correspond to 2018–19 through 2025–26. The source manifest records endpoints and normalization rules. Coverage requires 9,519 unique final regular-season games, 30 teams in each season, 82 games per team except the shortened seasons (72 in 2020–21, variable in 2019–20). NBA Cup championships are excluded and the 88 Orlando restart games are treated as neutral-site. Raw files and per-game replay outputs are ignored by Git; `model-artifact.json` records the normalized archive SHA-256 and compact evaluation evidence.

The baseline combines sequential Elo and exponentially weighted points scored/allowed. Each game is predicted before its result updates the team states. Offseason regression shrinks Elo and scoring rates. For each test season, a fixed 27-candidate grid of decay, Elo update and probability scale is selected by log loss using only earlier seasons. The initial 2018–19 season supplies warm-up history. The 2025–26 temporal holdout uses settings selected through 2024–25; it is now observed and must not be repeatedly presented as untouched after future changes. Aggregate metrics concatenate each fold's held-out forecasts, rather than retrospectively applying the last settings to earlier seasons.

Reports include accuracy, Brier score, log loss, margin/total MAE, calibration bins, prior-season home-frequency baseline and coverage at fixed 70/80/85/90% confidence thresholds. Wilson intervals assume independent outcomes and may understate team/season dependence. No threshold is selected to achieve an advertised accuracy. Future model changes require new prospective evidence or explicitly identified reused research holdouts.

This replay uses final outcomes collected retrospectively. It has no verified historical injury/lineup snapshots, player-rate fitting, prop settlement, time-matched bookmaker comparison or ROI evidence. The historical artifact is displayed behind login and is not automatically promoted into the 10,000-draw live model. The fixed Elo benchmark has K=18 and uses the same initial ratings, home/neutral-venue handling and offseason regression. Its settings are not fitted to the test season.

## Player archive

`npm run history:players` downloads eight published SportsDataverse/hoopR CSV assets with pinned SHA-256 digests. It joins ESPN game/player/team identifiers to the verified regular-season archive, excludes playoffs and Cup titles, normalizes boolean casing, rejects conflicting duplicates and quarantines invalid identifiers or missing stats. It does not infer zero or DNP from empty fields. Explicit source DNPs have zero recorded production; observed starter flags are retained only as postgame facts.

The audit reconciles player point sums to each final team score and requires five players with positive minutes per team. Suspect games are checked using separately cached ESPN summaries. Valid rows can replace the bulk rows only when the full team score reconciles; unresolved games are excluded from player training data. The current result is 245,438 records (202,212 non-DNP rows) across 9,486 games; 33 games remain excluded. Detailed row/game exceptions stay in `data/generated/player-history-audit.json`, and compact counts/source digests are in `player-history-artifact.json`. Starter/active fields are not used as pregame features. The dataset does not prove when a roster transaction or injury became known.

Next: fit and validate minutes and per-minute player rates using earlier-game records, build rotation/transaction features with availability cutoffs, compare game/player model candidates on earlier folds, and collect prospective frozen forecasts. Historical bookmaker lines are still absent; no prop hit-rate or ROI claim can be inferred from box scores alone.

## Input and execution

`examples/history-synthetic.json` demonstrates one row per game. Required: eventId, start, frozenAt, trainingCutoff, settledAt, probability, predictedHome, predictedAway, actualHome, actualAway, modelVersion and synthetic boolean. All timestamps have explicit offsets. Training cutoff must precede/equal freeze; freeze must precede tip-off; settlement must follow it. Duplicate event IDs and tied final scores are rejected. Use only predictions actually created before tip-off; do not reconstruct forecasts using current season aggregates and label them frozen.

```sh
npm run backtest -- examples/history-synthetic.json report.json
```

At each forecast, calibration uses only rows settled more than 24 hours before that forecast was frozen. It requires at least 30 prior games. Logistic calibration operates on log-odds with regularization toward identity. Future test results never fit earlier calibrators. Monthly out-of-sample folds, reliability bins, Brier, log loss, winner accuracy and team/margin MAE are reported. An expanding historical home-win frequency is the baseline. A seeded 1,000-replicate UTC-day cluster bootstrap estimates Brier uncertainty; small samples and inter-day dependence still limit inference.

## Before model promotion

1. Acquire licensed, timestamped schedules, outcomes, player logs, roster transactions, injury reports and odds history with documented availability times.
2. Build features using only information actually available at each forecast timestamp. Split chronologically by NBA season/date. The historical final season has now been inspected; prospective frozen forecasts provide the next untouched test.
3. Retrain base score/player-rate and covariance models inside each expanding/rolling training fold. Choose hyperparameters using nested earlier folds, never the next test block.
4. Generate and save out-of-sample pregame forecasts. Fit calibration on earlier out-of-sample forecasts only; evaluate game and prop families separately.
5. Report game probability Brier/log loss, home/team-strength/bookmaker baselines, score/margin MAE, interval coverage, player MAE, prop reliability and sample sizes. Segment by lineup uncertainty, rest, season and market.
6. Evaluate against timestamp-matched prices, then separately against closing prices. Grade pushes/voids with bookmaker rules. Report uncertainty, slippage and missing-market coverage before any ROI claim.
7. Run prospective shadow predictions with immutable freeze times. Promote only if preregistered improvements hold out of sample and calibration is stable.

Implemented prospective foundation: the first stored forecast for each event/model version is immutable, and later schedule refreshes settle it from final scores. The original first-event forecast is also preserved for backward compatibility. Pending: enough settled live games, point-in-time roster/injury snapshots, validation of final allocated player projections, closing-line ingestion and prop calibration. Imported historical rows still require independent provenance; timestamp assertions alone cannot prove when external inputs were available.
