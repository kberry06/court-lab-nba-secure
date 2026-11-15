# Latest finals and workload

Fresh matchup bundles use `verified-finals-1`. A final less than 24 hours old
can enter a forecast only after its complete box score has been received before
the forecast cutoff. Event/team identity, final scores, player statistics and
player/team point totals must reconcile. Incomplete latest boxes block preparation;
the previous saved forecast remains available. A scoreboard final can trigger
verification before the team schedule or athlete log catches up. Recent traded
players are followed by athlete ID and their latest final is verified separately.

Matchup inputs, current-season team schedules, current-season athlete logs and
recent final boxes have a five-minute cache. The automatic collector checks every
five minutes and recaptures an upcoming matchup when another game involving either
team becomes final, as well as its existing early/near-tip captures. This is a
polling target, not a guaranteed delivery time: source delays, incomplete boxes,
serial calculations and failed requests can delay a usable forecast. Prior-season
data and league-wide rating history keep their existing longer caches; current
matchup teams' verified results take precedence over the league cache.

The fitted game model already uses rest, back-to-back and travel features. Latest
verified results now reach both its score updates and the player form/minute
estimator. Player workload records the last appearance, tip-to-tip interval and
minutes in the 72 hours before the upcoming tip. These intervals are schedule
proxies, not measured physical recovery. On a back-to-back, at least three of the
player's own earlier comparable appearances can widen minute uncertainty above
its existing level. No arbitrary points or minute-mean fatigue penalty is applied.
This workload uncertainty change is unvalidated.

New summaries use `trained-opponent-rest-latest-final-1` (or
`recent-game-latest-final-1` when the trained game model is unavailable). The new
joint-minute research candidate is `minute-shadow-latest-final-3` and stays separate
from the displayed forecast. Original frozen forecasts remain immutable. New input
snapshots retain final verification receipts; refreshes produce new displayed runs.
Historical replay and minute-feature calls retain their 24-hour embargo unless
the explicit live policy and earlier verification receipts are supplied.

The chart's optional blue line shows actual minutes on its independent right axis;
hover a blue point for its value. Missing minutes are omitted, not treated as zero.
Overtime minutes expand that axis. Points, combo statistics, the selected prop line
and the green projection continue to use the left axis. The chart can fetch newer
review statistics than the saved forecast: both observation times are displayed.

Verification: 141 automated tests pass, including recent-final eligibility and
receipt cutoffs, incomplete-box rejection, causal workload inputs, back-to-back
game features, immutable research defaults, 240-minute simulation budgets,
collector recapture and the separate chart scale. A public-feed smoke check on
2026-11-15 verified complete event `401909982`, approximately 12 hours after tip;
a full fresh preparation for `401909985` included Indiana's latest final and
back-to-back context. These checks establish functioning inputs, not improved
forecast accuracy or calibrated props. Measure the new versions prospectively.
