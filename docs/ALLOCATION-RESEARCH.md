# Final player allocation audit — first research stage

This stage evaluates the part of the model that the earlier component tests omitted: the final player forecasts after allocating 240 team minutes and reconciling player points to the team score. It also tests a participation-aware research candidate. The candidate is **not promoted** and the live projection weights are unchanged.

## Data and chronology

- Eight-season player/game archive, with 2018–19 and 2019–20 available as warm-up; evaluation seasons are 2020–21 through 2025–26.
- 7,230 scheduled evaluation games; 7,222 have audited player boxes and usable earlier-game player pools. Eight are excluded for missing audited player boxes.
- Each forecast cutoff is one hour before tip-off. Results enter history only after a strict 24-hour embargo. Player histories retain earlier appearances across teams. Parameter choices come from the existing earlier-season selection folds; league priors freeze at the beginning of each season.
- Player pools use the last eligible team box-score listing, with previous observations used to resolve team changes. This is a **proxy**, not a point-in-time roster, injury or transaction archive. Target-game roster membership, starter status, DNP status, minutes and scores do not construct predictions.
- The proxy pools cover 144,373 of 153,620 actual positive-minute appearances (about 94%). The 9,247 missed appearances and 13,855 unmatched candidate-player records are reported. Missing target records are excluded rather than assigned fabricated zeros. This limits generalisation.

## Two distinct evaluations

1. **All-game plug-in replay:** deterministic expected-minute and team-score allocations on 7,222 games. These are approximations, not Monte Carlo results.
2. **Full production simulation audit:** 72 games, 12 per evaluation season, selected by a deterministic game-ID hash without inspecting results. Each model runs 10,000 draws per game. This uses the production simulation, including draw-level minute reallocation, scoring reconciliation and conditional-on-playing summaries. It contains 1,738 matched listed-player observations, of which 1,442 have positive minutes.

The simulation sample is small. Its results must not be presented as full-archive validation or an untouched holdout. All historical seasons have already been used in research.

## Candidate and findings

The candidate estimates appearance probability from the last ten earlier **listed** games, using a fixed Beta(1,1) prior. It weights the baseline rotation by those probabilities before simulating. These probabilities are not injury-conditioned; the production simulator also conditions lineups on at least five available players.

On the matched 72-game simulation sample:

| Measure | Current final simulation | Research candidate |
|---|---:|---:|
| Points MAE, including observed DNPs | 4.54 | 4.35 |
| Minutes MAE, including observed DNPs | 6.40 | 5.82 |
| Participation Brier, matched listed players | 0.170 | 0.109 |
| Points MAE, conditional on playing | 4.55 | 4.69 |
| Minutes MAE, conditional on playing | 5.53 | 5.30 |
| PRA MAE, conditional on playing | 6.20 | 6.22 |
| Nominal central 80% points-range coverage, if playing | 45.7% | 52.6% |

Before allocation, the matched playing cohort's point MAE is 4.54 and minute MAE is 4.86. The current final allocation introduces an average playing-player minute bias of −2.47 minutes and point bias of −1.00 points. The candidate reverses those biases to approximately +1.80 minutes and +0.92 points, but worsens playing-player points MAE. Improving DNP handling alone does not establish better player-prop predictions.

The candidate-minus-current point absolute-error difference **including observed DNPs** is −0.187 points, with a paired UTC-day cluster bootstrap 95% interval of approximately [−0.259, −0.113]. This is a different endpoint from conditional-on-playing error. It is not evidence of profitable props; dependence across teams, players and seasons and the missing historical pregame data can make uncertainty wider.

## Production decision

No candidate promotion. Historical pregame inputs are missing, playing-player points error worsened, and the final point ranges substantially under-cover. Player-prop confidence therefore remains Low and the comparisons are marked as uncalibrated research. That safeguard also applies to older saved projections when displayed.

## Reproduction and provenance

Run `npm run research:allocation` after generating the historical archives and the earlier-season game/player research reports. The script checks archive hashes, records input and implementation hashes, and writes:

- `allocation-research-artifact.json`: compact versioned evidence bundled into the secure app's Model validation page.
- `data/generated/allocation-replay-games.json`: ignored per-game simulation evidence.
- `experiments/allocation-v1.json`: fixed candidate and sampling protocol.

No runtime credentials or raw provider responses are committed. No new data subscription or hosted service is required.

## Input capture now implemented

New matchup refreshes persist compact current roster and injury observations in SQLite. Payloads are content-addressed to avoid repeating unchanged roster bodies; observations keep their own provider-observed and server-received timestamps. As-of reads require both timestamps to be at or before the forecast cutoff. Corrections append observations and do not rewrite previous inputs. Post-tipoff and future-observed captures are rejected. Raw historical stats and credentials are excluded.

This collection happens when matchup refreshes run. It is not continuous monitoring, historical backfill, an official transaction feed or a fitted feature model. Reconstructing effective transactions and testing injury effects remains pending.

## Still pending

- Verified point-in-time roster, transaction and injury snapshots, including observation/effective timestamps and corrections.
- Participation and conditional-minute models with joint rotation constraints; further candidates must be tested without hiding the final-allocation stage.
- Separate held-out calibration of spreads, totals and each supported prop family, including interval and tail checks.
- Frozen prospective prop forecasts joined to settled player outcomes and bookmaker quotes available at the same forecast time. Existing game forecast freezes and stored odds do not yet provide that complete comparison.
