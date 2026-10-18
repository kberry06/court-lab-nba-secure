# Data contracts and authorised odds

## Sportsbet research (13 October 2026)

[The Odds API bookmaker catalogue](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html) lists Sportsbet in its Australia coverage. Its [v4 API documentation](https://the-odds-api.com/liveapi/guides/v4/) documents game odds and per-event odds endpoints. Its [market list](https://the-odds-api.com/sports-odds-data/betting-markets.html) says player props are mainly US sports/bookmakers; this is **not confirmation** of Sportsbet NBA player props. No contract, API key, entitlement or redistribution licence was available for verification.

No official public Sportsbet odds API was established by this research. The [Sportsbet Feed terms](https://helpcentre.sportsbet.com.au/hc/en-us/articles/20973619526925-Sportsbet-Feed-Terms-Conditions) describe a customer content feature and are not an odds data API licence. See also [Sportsbet terms](https://helpcentre.sportsbet.com.au/hc/en-us/articles/115004802547-Sportsbet-Rules-Terms-Conditions). This application has no Sportsbet scraper, private-endpoint reverse engineering, bot-protection bypass or sportsbook login automation.

Before enabling an aggregator, obtain confirmation of NBA moneyline/spread/total coverage, NBA player points/rebounds/assists/PRA coverage specifically for Sportsbet AU, update frequency, historical timestamps, market settlement rules, personal/private display rights, retention and redistribution restrictions. Provider marketing is a lead for procurement, not evidence of Sportsbet authorisation. Contact/subscription/payment are pending user actions.

## Scenario import

Use `examples/scenario.json`. JSON contains immutable canonical event ID; `start` and `asOf` ISO timestamps with explicit UTC offset; `source`; `demo` boolean; and exactly two teams, home first. Each team has canonical ID/name, pace, offensive/defensive rating, rest days, and 6–20 player profiles. Each player has canonical ID/name, baseline minutes, availability probability, impact per 36-minute change and per-minute points/rebounds/assists. The demo profiles are deliberately generic and do not imply any real current player roster.

Use official NBA IDs where contractually supplied; otherwise assign stable internal UUIDs once and retain them. Never derive event IDs solely from dates or names: reschedules must keep the canonical event ID. Store times in UTC/explicit offsets; render with the IANA `Australia/Sydney` timezone, including daylight saving.

## Normalized odds import

POST `/api/odds/import` with `{ "quotes": [...] }`, or use the dashboard. Required fields:

| Field | Meaning |
|---|---|
| `source`, `rightsBasis` | Provider/manual provenance and permission basis |
| `sourceEventId`, `eventId` | External and canonical event identities |
| `bookmaker` | `sportsbet` for Sportsbet AU |
| `snapshotId`, `observedAt` | Coherent capture ID and provider quote timestamp |
| `market` | moneyline, spread, total, player_points, player_rebounds, player_assists, player_pra |
| `selection` | home/away for team markets; over/under otherwise |
| `price` | Decimal price greater than 1 |
| `line` | Required outside moneyline; signed from selected team's perspective for spread |
| `period`, `includesOvertime` | `full_game`, `true`; unsupported settlement scopes are rejected |
| `playerId`, `dnpRule` | Required for player props; canonical player ID and `void` |

The server assigns `receivedAt` separately. Observed times cannot be after tip-off or materially in the future. Unknown IDs fail validation. Do not update old observations in place. Paired odds in one snapshot must have the same exact observed timestamp for no-vig comparison. Single manual quotes do not produce a fabricated two-sided benchmark.

`examples/odds.json` is a **synthetic and intentionally old** snapshot. Its observations will be stale. It demonstrates schema and mapping, not current prices.

## Provider mapping

Register mapping through `/api/mappings` or the dashboard with `source`, `kind`, `externalId`, `canonicalId`. Mappings are durable; a conflicting remap fails and requires a reviewed migration. For The Odds API, event IDs use the provider event key; team mapping uses the provider's exact name because that endpoint supplies names; player name tokens are scoped as `providerEventId:providerPlayerDescription`. Canonical IDs remain stable even if name tokens change. No fuzzy name matching is used.

After approving the contract, configure the server secrets and POST `/api/provider/fetch` with `rightsBasis`. Only the fixed documented aggregator host is requested. The adapter checks event mapping, team orientation and start time (one-minute tolerance); unresolved/rescheduled cases return quarantine reasons. It fetches only h2h/spreads/totals. Player-prop fetch integration remains pending verified Sportsbet coverage and settlement terms. API keys are never returned to the client or written to logs.

## Useful endpoints

GET `/api/health` (public); GET `/api/status`, `/api/scenarios`, `/api/mappings`, `/api/backtest` (private when secured). POST `/api/scenarios`, `/api/simulate`, `/api/odds/import`, `/api/mappings`, `/api/provider/fetch`, `/api/backtest` requires session or admin bearer token. POST `/auth/login` creates a session; POST `/auth/logout` revokes it.
