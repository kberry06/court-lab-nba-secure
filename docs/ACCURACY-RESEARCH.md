# Accuracy research and live model, 24 October 2026

The new game model passed a retrospective probability-quality gate and is enabled for fresh matchups with complete league result coverage. The player recency/shrinkage estimator separately passed its component-error gate. Neither establishes a profitable betting edge or a validated player-prop distribution.

## Reproduce

After `npm run history:refresh`, run `npm run research:accuracy`. This regenerates the baseline and the two fitted artifacts from ignored research data. `experiments/accuracy-v1.json` records the feature families, candidate settings, data embargo, selection rules and promotion gate. Runtime needs only the compact artifacts; no training or bulk download runs inside web requests or builds.

## Game evaluation

Final scores become available to features 24 hours after tip-off. Schedule information supplies rest and back-to-back features before results are used. Sequential slow/fast team ratings adjust updates for opponent strength and regress between seasons. Elo, recent scoring form and rolling league scoring context provide additional features. Road-trip/previous-away features are proxies, not geographic travel measurements; the selected live family does not include those proxies.

Each candidate classifier is regularized logistic regression fitted on at most three earlier seasons. Optional calibration uses earlier out-of-sample forecasts only. Totals use a regularized regression. Candidate results start in 2019–20; each evaluated season from 2020–21 onward chooses its candidate using only earlier seasons' out-of-sample log loss. The final deployment candidate is chosen by that same rule over all available completed validation seasons, then refitted using the most recent three seasons.

The comparison contains the same 7,230 games for both models. Winner accuracy: 65.38% versus 65.31%; Brier: 0.21605 versus 0.21813; log loss: 0.62095 versus 0.62585. The paired UTC-day cluster bootstrap Brier difference interval is approximately -0.00319 to -0.00091. This supports probability improvement; it does not establish a meaningful hit-rate improvement. In 2025–26, winner accuracy falls from 69.43% to 68.29%, while log loss improves from 0.60172 to 0.59560. Both are reported rather than selecting the more flattering measure.

Full-game margins use a conditional logistic distribution with location `scale * logit(p)`, preserving the classifier's winner probability. Margin scale is fitted by conditional density loss on earlier out-of-sample games. This replaced a least-squares scale after an initial retrospective range audit showed narrow intervals; all historical seasons are explicitly reused research. Total dispersion and residual correlation use earlier out-of-sample errors. Historical central 80% range coverage is about 78.0% for margins and 80.9% for totals. Spreads/totals still require market-specific calibration and prospective checking.

The historical probability gate requires lower paired-game Brier/log loss, a paired day-cluster 95% Brier-difference upper bound below zero, and no latest-season log-loss deterioration. Passing this gate enables the game component for prospective research. It does not turn the full lineup-adjusted simulation into independently validated evidence.

## Player evaluation

The player estimator uses up to 20 earlier positive-minute appearances across teams, exponential recency in appearance count, and shrinkage toward the player's longer-window rate and past league priors. Six half-life/prior-strength combinations are compared using earlier-season errors. Cold starts remain included. The live data collector follows player IDs across trades and deduplicates game IDs when completing the history window.

Evaluation is conditional on a positive-minute appearance, with a 24-hour result embargo. The 153,620 held-out appearances include 1,850 cold starts. It tests component minutes and expected PTS/REB/AST and their combinations before team minute/score reconciliation. The selected live settings are a three-appearance half-life and 240-minute prior strength. This is not a test of pregame participation forecasts, final allocated player scores, distribution tails or bookmaker prop hit rates.

## Live use and remaining limitations

Fresh projections load league-wide current-season results through a shared six-hour cache, then update the saved rating state. Inputs observed before the model's training cutoff cannot use its fitted parameters. Missing complete league coverage retains an explicitly labelled recent-score fallback. Old saved projections are marked for regeneration; refresh preserves their historical audit records.

The trained game margin/total distribution feeds the 10,000 seeded draws. The fit already includes full-game overtime, so rounded ties receive a one-point resolution rather than another full overtime simulation. Scenario injury probabilities and minute-weighted player impacts still adjust those draws, and remain heuristic. Player points still reconcile to team scores, which means component player MAE does not equal final simulated player MAE.

Each `(event, model version)` freezes its first pregame forecast separately in SQLite. Outcomes settle those records without overwriting earlier models. `/api/accuracy` reports historical evidence and the number of settled forecasts for the new version behind sign-in. Future frozen forecasts supply the next untouched test; the historical seasons have already been examined.

Next accuracy work: point-in-time roster/transaction and injury features; evaluation of final allocated player projections; market-family calibration for spreads/totals/props; more reliable participation/minutes uncertainty; and prospective model-versus-market comparisons at matched quote times.
