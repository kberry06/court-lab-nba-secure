# Historical data attribution

Player box scores: **SportsDataverse / hoopR NBA authors**, sourced from ESPN. Published release: <https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_player_boxscores>. Producing repository: <https://github.com/sportsdataverse/hoopR-nba-data>.

The producing repository states **Creative Commons Attribution 4.0 International (CC BY 4.0)** for its data, code and documentation: <https://github.com/sportsdataverse/hoopR-nba-data/blob/main/LICENSE.md>. Licence text: <https://creativecommons.org/licenses/by/4.0/>. The release repository separately licenses its software under MIT. These statements do not imply endorsement by SportsDataverse, ESPN or the NBA, nor grant rights to trademarks or other third-party material.

Court Lab changes: selected seasons ending 2019–2026; restricted records to the verified regular-season game archive; normalized identifiers, numeric statistics and booleans; quarantined missing/inconsistent rows; checked suspect games against ESPN summaries; excluded games whose player points could not be reconciled to final team scores; generated aggregate research reports. Original bulk assets are cached privately and remain outside Git. `data/player-source-manifest.json` pins their published sizes and SHA-256 digests. `player-history-artifact.json` records normalized coverage and the correction-source digests.

Game schedules and repair summaries: publicly accessible ESPN NBA JSON, accessed for the owner's private research. Raw ESPN responses remain outside Git; public accessibility alone is not represented as an open redistribution licence. Endpoints and normalization rules are recorded in `data/source-manifest.json`. NBA Cup and 2020 restart treatment follows the NBA's published competition/restart rules.

This historical import contains no Sportsbet scraping or historical bookmaker prices. Sportsbet odds continue to use the separately approved Odds API connection.
