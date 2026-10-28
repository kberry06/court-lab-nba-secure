# Role-based minute budget, version 1

The previous allocator proportionally reduced every player's historical role when current-roster role totals exceeded 240. Live rosters contain 17–20 players, many with positive historical roles, so this systematically diluted established roles. In the recent descriptive live audit, usable conditional minute projections averaged 3.77 minutes below actual appearances. That observed bias is not used as an across-the-board additive correction: team draws must still sum to 240.

Newly prepared matchups retain each player's unscaled positive-appearance minute estimate as `roleMinutes`. A bounded least-squares projection fits these targets to a 240-minute team budget using equal absolute adjustments, preserving role differences instead of percentage dilution. Every draw samples conditional role variation, projects available players into 0–48 regulation minutes and conserves the budget. Confirmed outs remain unavailable. Other availability probabilities remain assumptions. Sampling variation uses the earlier positive-minute history variance shrunk toward a six-minute SD prior, bounded to 4–12 minutes. Fewer than three observations use the prior. This is not an injury-conditioned joint participation model.

Manual lineup minute edits change the role target. The baseline minute allocation used for injury-impact accounting stays fixed. Saved original forecasts remain immutable; fresh trained projections use `trained-opponent-rest-role-budget-1`. Older saved projections remain viewable, and upcoming matchups signal that they need preparation with the new version. The model fingerprint now includes the minute allocator source. Uncalibrated player props remain Low confidence.

## Paired historical evidence

`node scripts/research-minutes.js` checks the same 72 deterministic game-ID sampled games across 2020–21 through 2025–26, with 10,000 draws per model/game and 1,442 paired observed appearances. Player estimates use earlier-season parameters; historical statistics clear the 24-hour embargo. These are reused research seasons with previous-box-score roster proxies, not a verified complete historical pregame roster/injury archive.

| Measure, conditional on playing | Previous | Revised |
|---|---:|---:|
| Minutes MAE | 5.526 | 5.378 |
| Minute bias, projection minus actual | -2.475 | -2.083 |
| Points MAE | 4.554 | 4.538 |
| Nominal 80% minute interval coverage | 21.8% | 71.9% |
| Nominal 80% points interval coverage | 45.7% | 61.7% |

The paired UTC-day bootstrap minute-error difference is -0.148 minutes, with interval -0.223 to -0.078. Five of six season folds improve minutes; 2021–22 worsens. The points difference interval includes zero (-0.044 to +0.009), so better point accuracy is not established. Wider ranges still under-cover outcomes. No betting-edge, calibrated-prop or untouched-holdout claim follows.

A separate structural check used an already saved public-data bundle with 17 players per team and raw roles totaling about 322/297 minutes. Established-role means increased roughly 1–2.4 minutes while preserving legal budgets and confirmed-outs behavior. This is a sensitivity check, not additional accuracy evidence; the raw check stays in ignored local research outputs.

The allocation correction is enabled for new inputs, while full model promotion/validation remains pending. Live results must accumulate under the new version separately. The remaining issues include complete pregame participation evidence, current-team role changes, cold starts, overtime minute distributions and prop-family calibration. A modest historical minute improvement does not fix all current minute bias or guarantee better points.

The compact `minutes-research-artifact.json` records cohorts, season folds, source/code hashes, ranges and deployment scope. Tests cover crowded/underfilled rosters, exact budgets, unavailable players, reproducible draws, score reconciliation, source-preserving role targets and invalid uncertainty inputs. No new data subscription, secret or Render resource is required.
