import {assert} from './validation.js';
import {normalizeQuote} from './odds.js';
// Exact, unique full-name matches within a small schedule tolerance. NBA feeds can
// disagree by several minutes as broadcasters and books revise the listed tip-off.
// Ambiguous or materially rescheduled games remain quarantined.
export const EVENT_START_TOLERANCE_MS=30*60*1000;
export function registerExactMatches(events,store) {
 for(const e of events){
  const matches=store.scenarios().filter(s=>!s.demo&&s.teams[0].name===e.home_team&&s.teams[1].name===e.away_team&&Math.abs(Date.parse(s.start)-Date.parse(e.commence_time))<=EVENT_START_TOLERANCE_MS);
  if(matches.length!==1)continue;const s=matches[0];
  for(const [kind,externalId,canonicalId] of [['event',e.id,s.id],['team',e.home_team,s.teams[0].id],['team',e.away_team,s.teams[1].id]])store.map({source:'the-odds-api',kind,externalId,canonicalId});
  for(const b of e.bookmakers||[])for(const m of b.markets||[])for(const o of m.outcomes||[]){if(!o.description)continue;const players=s.teams.flatMap(t=>t.players).filter(p=>p.name===o.description);if(players.length===1)store.map({source:'the-odds-api',kind:'player',externalId:`${e.id}:${o.description}`,canonicalId:players[0].id});}
 }
}
// Explicit reviewed mapping only. This provider supplies team/player names rather
// than stable IDs, so its name tokens are scoped by provider (players by event).
export function mapProviderEvents(events,store,{rightsBasis,now=Date.now()}={}) {
 const quotes=[],quarantine=[];
 for(const e of events){try{
  const id=store.resolve('the-odds-api','event',e.id),s=store.scenario(id);
  assert(s,'Unmapped event');
  assert(store.resolve('the-odds-api','team',e.home_team)===s.teams[0].id&&store.resolve('the-odds-api','team',e.away_team)===s.teams[1].id,'Team orientation mapping mismatch');
  assert(Math.abs(Date.parse(e.commence_time)-Date.parse(s.start))<=EVENT_START_TOLERANCE_MS,'Start time mismatch; review rescheduling');
  const eventQuotes=[];
  for(const b of e.bookmakers||[]){if(b.key!=='sportsbet')continue;for(const m of b.markets||[]){const market={h2h:'moneyline',spreads:'spread',totals:'total',player_points:'player_points',player_rebounds:'player_rebounds',player_assists:'player_assists',player_points_rebounds_assists:'player_pra',player_points_assists:'player_pa',player_rebounds_assists:'player_ra',player_points_rebounds:'player_pr'}[m.key.replace(/_alternate$/,'')];if(!market){quarantine.push({sourceEventId:e.id,market:m.key,reason:'Unsupported provider market'});continue;}
   for(const o of m.outcomes||[]){try{const player=market.startsWith('player_');const selection=['moneyline','spread'].includes(market)?(o.name===e.home_team?'home':o.name===e.away_team?'away':null):o.name?.toLowerCase();
    const q={source:'the-odds-api',sourceEventId:e.id,eventId:id,bookmaker:b.key,snapshotId:`${e.id}:${m.last_update||b.last_update}`,observedAt:m.last_update||b.last_update,market,selection,price:o.price,period:'full_game',includesOvertime:true,rightsBasis,providerMarket:m.key};
    if(market!=='moneyline')q.line=o.point;
    if(player){q.playerId=store.resolve('the-odds-api','player',`${e.id}:${o.description}`);q.dnpRule='void';}
    eventQuotes.push(normalizeQuote(q,s,now));
   }catch(error){quarantine.push({sourceEventId:e.id,market:m.key,player:o.description||null,reason:error.message});}
   }
  }}quotes.push(...eventQuotes);
 }catch(error){quarantine.push({sourceEventId:e.id,reason:error.message});}}
 return {quotes,quarantine};
}

export function propCoverage(event,mapped,checkedAt=new Date().toISOString()){
 const book=event.bookmakers?.find(b=>b.key==='sportsbet'),markets=(book?.markets||[]).filter(m=>m.key.startsWith('player_'));
 const returned=markets.reduce((n,m)=>n+(m.outcomes?.length||0),0),accepted=mapped.quotes.filter(q=>q.market.startsWith('player_')).length;
 const note=accepted?`The Odds API supplied ${accepted} Sportsbet player selections (${markets.length} markets). ${mapped.quarantine.length} mapping issues held for review.`:returned?`The Odds API supplied ${returned} player selections, but none could be mapped. Review the mapping issues below.`:'The Odds API supplied no Sportsbet player selections for this event. Sportsbet may still offer them on its website. Use permitted manual entry when feed coverage is missing.';
 return {checkedAt,source:'The Odds API',sportsbetPresent:!!book,markets:markets.map(m=>m.key),returned,accepted,issues:mapped.quarantine,note};
}
