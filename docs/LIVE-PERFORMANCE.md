# Recent live performance and input refresh

The Model validation page starts with a rolling 48-hour, 72-hour, seven-day or 30-day report. `GET /api/research/performance?days=3` supplies it through the existing authenticated session.

Game evaluation uses each model version's first immutable saved pregame forecast, not today's regenerated projection. The window is based on tip-off time; dates display in Australia/Sydney. Models are separate. It reports winner counts, Brier/log loss, margin/total MAE and signed bias, pending outcomes, input age and per-game results. Unsaved games are not invented and small samples do not establish stable accuracy.

Player evaluation additionally requires a saved run that exactly matches the frozen game forecast and was recorded within five seconds of its freeze. Only its original conditional player projections are scored against a complete, reconciled final box. DNPs enter participation scoring, missing player records stay missing, and actual participants outside the predicted pool are counted. Player metrics include minutes/points/rebounds/assists MAE, signed bias and nominal 80% interval coverage. Largest points errors expose individual misses. A fixed last-five mean benchmark is compared on the same valid cases using only performances present in the saved pregame inputs. No benchmark or calibration is promoted from this small descriptive audit.

Legacy records do not prove default-scenario provenance or distinguish every historical code fingerprint. Their performance is descriptive; it is not calibration-acceptance evidence. The separate matched-time ledger retains its stricter gates.

Update final results checks up to eight saved events per request. It now includes games recorded before matched-odds tracking existed. Checks use bounded concurrent requests and retain existing outcomes on failure; repeated checks can cover the rest of the slate. ESPN final-summary headers put the event date under `competitions[0].date`, while scoreboards also expose a top-level date. Both forms are normalized, and uncertain times still fail closed. This fixes previously rejected final summaries. No forecast is rewritten by settlement.

An explicit schedule-card Refresh prediction bypasses the assembled matchup cache and reloads team roster/injury lists, team histories and required player logs. Automatic initial preparation keeps ordinary caching. This refresh improves input freshness; it does not establish an improvement in predictive accuracy, create verified starting lineups or change fitted model parameters. Existing league-wide rating cache and historical 24-hour result embargo remain in effect. There is no new service, paid subscription, secret or unattended job.

Tests cover Sydney date grouping, strict pregame selection, separate model versions, missing/future results, matching original player runs, reschedules, DNPs/missingness, settlement without matched odds, summary-header dates and explicit cache bypass.
