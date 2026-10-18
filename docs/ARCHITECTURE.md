# MVP architecture

Browser → HTTPS on Render → private Node HTTP application → SQLite on `/var/data`.

The server owns authentication, validation, provider access and persistence. Dedicated worker threads run bounded simulations/backtests so health checks and sign-in remain responsive. One calculation runs at a time, with a 60-second ceiling and a 5 MB import limit. A single Render instance owns the SQLite volume; no Redis, Python service or browser-only compute is required.

## Modules

| Module | Responsibility |
|---|---|
| `server.js`, `auth.js` | Protected routes, body/rate limits, sessions, security headers |
| `validation.js` | Canonical scenario and numeric/time constraints |
| `model.js`, `worker.js` | Seeded 10,000 correlated draws and summaries |
| `odds.js`, `adapter.js` | Quote validation, settlement-aware valuation, provider mapping |
| `store.js` | WAL SQLite tables, migration marker, transactions and audit records |
| `backtest.js` | Past-only forecast calibration and evaluation |
| `public/` | Responsive dashboard, private login, imports and lineup controls |

## Simulation assumptions

The first team is home. Possessions use the average input team pace plus a shared normal shock. Team scoring efficiency combines supplied offensive/defensive ratings around a league reference of 114, home advantage, back-to-back rest penalty and minute-weighted player impacts. Scores share a pace and game environment factor but have independent team residuals. This creates positive score correlation.

Each player independently samples availability. Impossible lineups with fewer than five active players are rejected; a bounded rejection loop fails clearly if the input availability assumptions cannot support a game. Availability probabilities therefore become conditional on a valid lineup. Active minutes are proportionally reallocated with a 48-minute regulation cap and 240-minute team total. Usage redistribution uses baseline points/minute and active minutes; a scoring shock sets relative player shares, and integer point allocation exactly reconciles to simulated team scores. Rebounds and assists share environment/involvement factors, but are not generated from possession-level play-by-play. Their totals are not constrained to a full basketball box score.

Tied regulation outcomes receive simulated overtime until resolved. Player minutes scale with overtime; regulation minutes alone are constrained to 240. This is an approximate model, not a fitted possession simulator. The baseline has no opponent matchup assignments, travel-distance feature, explicit rotation graph, foul-out process or measured player covariance matrix.

All input assumptions and summaries are stored with model version and seed. Large per-draw arrays are used for pricing then discarded; the immutable stored scenario plus seed reproduces them for the same model code. Store the Git revision alongside operational releases for reproducibility.

## Fair pricing

For a selected market, each draw becomes win, loss, push or void. DNP player props void. Fair model probability is `wins / (wins + losses)`; fair decimal odds are `(wins + losses) / wins`. Expected net return per unit is `[wins × (decimalPrice − 1) − losses] / allDraws`. Pushes and voids contribute zero. Probability edge is model decisive probability minus `1/price`; this differs from no-vig comparison and from EV.

Bookmaker no-vig probabilities use proportional normalization only when both opposing quotes share source, snapshot, exact timestamp, event, book, market, player and compatible line. Alternate lines remain separate. Single-sided markets do not fabricate a no-vig estimate.

Quotes older than 15 minutes, input snapshots older than 24 hours, started fixtures and demo scenarios are marked ineligible. Freshness eligibility is not a model-quality endorsement. The dashboard never executes bets.

## Scaling path

For multiple instances: migrate to managed PostgreSQL, move computations to a queue/worker service, centralize rate limits/sessions and add object storage for licensed raw snapshots. Before public multi-user use add account provisioning, per-user authorization, MFA/SSO and access review. MVP is a private single-user research app; no self-registration.
