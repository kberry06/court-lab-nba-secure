# The 1.5-minute accuracy target

The acceptance target is no more than 1.5 minutes mean absolute error on the complete conditional-appearance cohort. It is not a target for signed average bias, a selected stable-player group, or only correct predictions. The target is not met. The new learned candidate is not called by the live model and has not replaced the deployed role-budget allocator.

## Expanded test

A fixed robust regression uses 27 pregame features: recent means/medians and variability; trends; earlier listed participation and starter history; time since an observed appearance; cold/long-gap indicators; and an earlier-season game model's expected margin. IRLS approximates median regression with one-minute residual smoothing and fixed regularization. Half of training cases deterministically mask prior starter metadata to test incomplete feed coverage. No target-game starter or injury flag enters the features.

Game results are released only after a 24-hour embargo. Predictions are constructed one hour before tip-off; each season's coefficients are fitted only to earlier seasons whose results precede the fold. Training-season dates, fitted parameters, source checksums and code hashes are recorded. Features and exported coefficient predictions are cross-checked in JavaScript. Python/NumPy is used offline only; deployment gains no Python/package dependency.

Across 153,620 observed positive-minute appearances in 2020–21 through 2025–26:

| Comparable raw role measure | Baseline | Candidate |
|---|---:|---:|
| Minutes MAE | 5.048 | 4.966 |
| Signed minute bias | -0.070 | -0.058 |
| Absolute-error median | 3.968 | 3.876 |
| Predictions within 1.5 minutes | 20.4% | 20.9% |

The prior-defined stable-starter group contains 26,657 appearances. Its baseline MAE is 3.924 and candidate MAE is 3.962. It is shown for diagnosis, not used to substitute a better-looking headline. Role changes, cold starts and returns after long gaps remain in the main result. The paired forecast-day bootstrap detects a small mean error change (-0.082, interval -0.092 to -0.071); statistical significance does not make it meet the material target.

These raw role estimates precede final team minute and point allocations. They cannot be compared directly with the deployed simulator's 5.378-minute allocated audit. A candidate must meet the material gate and pass paired final-allocation and point-regression checks before replacement. All historical seasons have already been inspected; none is claimed as an untouched test. The results do not prove a 1.5-minute MAE is impossible, but they do not justify promising it.

## Information needed next

Confirmed pregame starting status, game-specific active rotations, reliable return-to-play/minute restrictions and timely lineup changes are materially different inputs from older game logs. Injuries labelled questionable or not listed do not establish those facts. An early pregame spot check of the existing public summary feed returned no game-specific player list. Coverage nearer tip-off must be verified separately; no projected or postgame starter is labelled confirmed pregame.

Fresh matchup normalization now retains explicit historical DNP rows, prior starter booleans and observed minutes. Missing players stay missing. Current predictions still use positive appearances for rate/role estimates. Snapshots whitelist the last ten known earlier role records per roster player, exclude current/future games and preserve the observation/receipt clock. Existing older snapshots are not retrospectively filled. These improvements create prospective evidence; they do not themselves establish better accuracy or introduce a new injury-conditioned participation model.

## Reproduction

1. Prepare the existing audited archive and earlier-season research artifacts.
2. `node scripts/prepare-minute-learning.js`
3. Run `scripts/research-minute-learning.py` with Python and NumPy.
4. `node --test`

Only compact `minute-learning-artifact.json` and code/docs are versioned. The 201,403 generated source appearances (including warm-up years), feature rows and per-case evaluation outputs remain in ignored `data/generated/`. No paid service, scraped sportsbook data, credentials or external messages are involved.
