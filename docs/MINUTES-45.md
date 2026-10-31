# Working toward 4.5-minute final prediction error

The active acceptance threshold is **4.5 minutes mean absolute error after the final team allocation**, with no point-MAE regression and the same evaluated player identities. An earlier 1.5-minute aim remains recorded in its historical experiment, but is not the current acceptance threshold. Stable-starter groups cannot replace the full evaluated cohort.

## Experiments

The fixed nonlinear learner uses 42 earlier-game role features, separating earlier starter and bench workloads, role changes, current-team history, time gaps, missing metadata and game-model context. A histogram gradient boosting regressor minimizes absolute error. All coefficients/trees for a season are fitted only on earlier seasons. Current-game starter status, target injuries, actual participation and outcomes do not enter the feature generator.

Raw conditional-role errors are measured on 153,620 positive-minute appearances. They are not the final deployment criterion. Exported tree predictions are checked against 28 full native-model predictions and a small synthetic native-estimator golden fixture, without a Python dependency in production.

Three allocation experiments are recorded rather than hiding failed variants:

1. Learned role targets with incumbent participation assumptions.
2. Learned roles plus Beta(1,1) smoothed earlier observed-appearance exposure in ten team reports. A missing listing is never relabelled as a confirmed DNP. The two latest observed teams provide a limited recent-transfer fallback.
3. A consistency correction to those probabilities: minimize their Bernoulli KL change subject to the expected conditional-role minute sum equalling 240 when feasible. Zero appearance priors stay zero. When available role mass is below 240, that shortfall is reported; no missing player record is fabricated.

Each uses the same 72 game-ID-selected games across six seasons, 10,000 draws per model/game, a one-hour pregame cutoff and 24-hour result embargo. Two paired input pools are tested: the last earlier listed roster and a larger prior-union roster capped at 20 players. Both remove players last observed on another team. These are historical roster proxies, not verified pregame active lists. The larger pool is a stress test, not a claim about the actual current live roster.

Candidate and incumbent are compared on exactly the same observed player identities within each pool. Unobserved target records remain missing, not zero. Positive appearances outside the pool, unknown target records, conditional metrics and all-listed metrics are all reported. Minute conservation and every downstream point allocation are included in the comparison. A gain in the larger stress test cannot hide a regression in the standard pool.

## Gates and limitations

`src/minute-acceptance.js` evaluates the numerical final-allocation gates. Failing variants do not change the live engine or confidence labels. Even a numerical pass would leave prospective validation and bookmaker calibration pending.

These historical seasons and the 72-game sample have already been inspected. Successive experiments are reused research, not independent untouched tests. The late-roster, actual starting-lineup and minute-restriction information remains incomplete. Observed appearance frequencies are approximate priors, not verified injury-conditioned participation probabilities.

The simulation uses regulation-minute budgets with the inherited overtime treatment. The source archive and roster proxy coverage constrain conclusions. Current live accuracy cannot be inferred directly from these experiments.

## Reproduce

Development-only dependencies are installed into the ignored workspace directory `data/generated/ml-libs`. Pin scikit-learn 1.9.1; the original run used NumPy 2.5.4 and SciPy 1.18.1. Production remains Node-only.

1. `node scripts/prepare-minute-regimes.js`
2. Run `scripts/research-minute-regimes.py` with the development Python runtime.
3. `node scripts/audit-minute-regimes.js`
4. `node scripts/audit-minute-participation.js`
5. `node scripts/audit-minute-balance.js`
6. `node scripts/verify-minute-regime-export.js`
7. `node --test`

The experiment manifests fix parameters and gates. Compact report artifacts are versioned, while complete trees, feature rows, native runtime packages and raw per-case data stay in ignored research directories. No new paid service, odds source, secret or unattended task is introduced.

## Measured final results

| Variant | Standard roster minute MAE | Larger roster stress minute MAE | Standard point MAE | Stress point MAE |
|---|---:|---:|---:|---:|
| Incumbent | 5.378 | 7.856 | 4.538 | 4.982 |
| Learned roles | 5.153 | 7.377 | 4.496 | 4.879 |
| Roles plus unbalanced participation | 6.317 | 4.997 | 5.090 | 4.610 |
| Balanced participation | 4.832 | 4.861 | 4.530 | 4.536 |

The balanced model improves the standard minute result by about 10%, but neither pool meets 4.5. It is not promoted. Standard comparisons cover 1,442 observed appearances (105 actual positive appearances outside the pool); the larger pool covers 1,516 (31 outside). Unknown target records remain excluded and counted: 149 and 1,030 respectively. The larger pool is intentionally a prior-union stress proxy with stale membership uncertainty, not a live-roster accuracy claim.

## Forward shadow operation

Fresh matchup preparation now runs a separate experimental projection after saving the default result. The shadow uses the same observed bundle, a frozen all-history role model, earlier reconciled team reports and available prior player histories. Confirmed outs remain out; the existing injury availability assumptions bound the appearance inputs. Missing current-team observations and missing prior starter metadata remain limitations. This is not a confirmed-lineup feed.

The learned-role probabilities are balanced against the injury-adjusted available role mass. When that mass is too small, the quality record states the shortfall. Runtime feed coverage and transfer metadata differ from historical proxies, so the historical 4.83 result cannot be presented as its live expected accuracy.

Shadow results are written to their own SQLite table and model version. The default run, displayed projection, sportsbook comparison ledger and immutable original forecasts remain separate. Each shadow record links its contemporaneous incumbent run and input snapshot receipt/hash. The existing recent-performance report grades frozen shadow forecasts separately when results are settled; a first-ever default forecast may have a different horizon, so those aggregate version metrics are not automatically a matched-time paired comparison.

A shadow failure or tip-off reached during calculation preserves the default result. Worker completion is awaited before the second calculation starts. No extra Render resource, scheduler or secret is needed. A research-only status endpoint is available at GET /api/research/shadow through the existing sign-in.

The 72-game artifacts retain hashes of the engine code used for those runs. Adding a separate shadow-mode alias afterward does not rewrite those historical code hashes. Runtime parity checks and the new shadow model carry their own provenance.
