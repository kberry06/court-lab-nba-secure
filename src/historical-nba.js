import {normalizeEvent} from './public-nba.js';

export const ESPN_NBA_TEAMS=Object.freeze(Array.from({length:30},(_,i)=>i+1));
export const HISTORY_SEASONS=Object.freeze([2019,2020,2021,2022,2023,2024,2025,2026]);

export function normalizeHistoricalSchedules(payloads) {
  const games=new Map();
  for(const {season,body} of payloads) {
    if(!Array.isArray(body?.events))throw new Error(`Historical schedule unavailable for ${season}`);
    for(const event of body.events) {
      if(Number(event.seasonType?.type||2)!==2)continue;
      // Cup title games appear in ESPN regular-season schedules but do not count in NBA standings.
      if(event.competitions?.[0]?.type?.id==='39'||event.competitions?.[0]?.type?.slug==='commissioners-cup')continue;
      const game=normalizeEvent(event);
      if(game.status_state!=='final')continue;
      if(!Number.isFinite(game.home_team_score)||!Number.isFinite(game.visitor_team_score))continue;
      const prior=games.get(game.id),row={...game,season:Number(game.season||season),neutralSite:Boolean(event.competitions?.[0]?.neutralSite)};
      // ESPN incorrectly flags the 2020 Orlando restart as home venues. NBA's restart was a single-site campus.
      if(row.season===2020&&row.date>='2020-07-30'&&row.date<='2020-08-15')row.neutralSite=true;
      if(row.season!==season)throw new Error(`Requested season ${season} returned game ${game.id} from ${row.season}`);
      if(prior&&(prior.home_team_score!==row.home_team_score||prior.visitor_team_score!==row.visitor_team_score))throw new Error(`Conflicting duplicate game ${game.id}`);
      games.set(game.id,row);
    }
  }
  return [...games.values()].sort((a,b)=>a.datetime.localeCompare(b.datetime)||a.id-b.id);
}

export function validateHistoricalCoverage(games,seasons=HISTORY_SEASONS) {
  const counts=Object.fromEntries(seasons.map(s=>[s,0])),ids=new Set();
  for(const g of games) {
    if(ids.has(g.id))throw new Error(`Duplicate historical game ${g.id}`);ids.add(g.id);
    if(!(g.season in counts))continue;
    if(g.home_team.id===g.visitor_team.id||!Number.isFinite(Date.parse(g.datetime))||g.status_state!=='final'||g.home_team_score<=0||g.visitor_team_score<=0||g.home_team_score===g.visitor_team_score)throw new Error(`Invalid historical game ${g.id}`);
    counts[g.season]++;
  }
  const teamsBySeason={};
  for(const s of seasons){const rows=games.filter(g=>g.season===s),teams=new Set(rows.flatMap(g=>[g.home_team.id,g.visitor_team.id]));teamsBySeason[s]=teams.size;const expected=s===2020?1059:s===2021?1080:1230;if(counts[s]!==expected||teams.size!==30)throw new Error(`Season ${s} incomplete or contaminated: ${counts[s]} games (expected ${expected}), ${teams.size} teams`);if(s!==2020)for(const t of teams){const n=rows.filter(g=>g.home_team.id===t||g.visitor_team.id===t).length;if(n!==(s===2021?72:82))throw new Error(`Season ${s}: team ${t} has ${n} games`);}}
  return {seasons,counts,teamsBySeason,total:Object.values(counts).reduce((a,b)=>a+b,0),firstGame:games[0]?.datetime,lastGame:games.at(-1)?.datetime};
}
