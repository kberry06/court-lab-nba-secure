# Accuracy and validation protocol

The MVP implements a **walk-forward audit of pre-existing frozen predictions**, not end-to-end historical model retraining. The synthetic report is a functional check only. No live calibration coefficients are promoted from it, and no synthetic performance is advertised as NBA accuracy.

## Input and execution

`examples/history-synthetic.json` demonstrates one row per game. Required: eventId, start, frozenAt, trainingCutoff, settledAt, probability, predictedHome, predictedAway, actualHome, actualAway, modelVersion and synthetic boolean. All timestamps have explicit offsets. Training cutoff must precede/equal freeze; freeze must precede tip-off; settlement must follow it. Duplicate event IDs and tied final scores are rejected. Use only predictions actually created before tip-off; do not reconstruct forecasts using current season aggregates and label them frozen.

```sh
npm run backtest -- examples/history-synthetic.json report.json
```

At each forecast, calibration uses only rows settled more than 24 hours before that forecast was frozen. It requires at least 30 prior games. Logistic calibration operates on log-odds with regularization toward identity. Future test results never fit earlier calibrators. Monthly out-of-sample folds, reliability bins, Brier, log loss, winner accuracy and team/margin MAE are reported. An expanding historical home-win frequency is the baseline. A seeded 1,000-replicate UTC-day cluster bootstrap estimates Brier uncertainty; small samples and inter-day dependence still limit inference.

## Before model promotion

1. Acquire licensed, timestamped schedules, outcomes, player logs, roster transactions, injury reports and odds history with documented availability times.
2. Build features using only information actually available at each forecast timestamp. Split chronologically by NBA season/date; retain an untouched final season.
3. Retrain base score/player-rate and covariance models inside each expanding/rolling training fold. Choose hyperparameters using nested earlier folds, never the next test block.
4. Generate and save out-of-sample pregame forecasts. Fit calibration on earlier out-of-sample forecasts only; evaluate game and prop families separately.
5. Report game probability Brier/log loss, home/team-strength/bookmaker baselines, score/margin MAE, interval coverage, player MAE, prop reliability and sample sizes. Segment by lineup uncertainty, rest, season and market.
6. Evaluate against timestamp-matched prices, then separately against closing prices. Grade pushes/voids with bookmaker rules. Report uncertainty, slippage and missing-market coverage before any ROI claim.
7. Run prospective shadow predictions with immutable freeze times. Promote only if preregistered improvements hold out of sample and calibration is stable.

Implemented prospective foundation: the first stored real-game forecast before tip-off is immutable, and later schedule refreshes settle it from final scores. Re-runs remain available for research but cannot overwrite the evaluation forecast. Pending: enough settled live games, historical backfill with point-in-time roster/injury snapshots, model fitting/retraining orchestration, historical player forecasts, closing-line ingestion and prop calibration. Imported historical rows still require independent provenance; timestamp assertions alone cannot prove when external inputs were available.

