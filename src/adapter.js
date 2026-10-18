import {assert} from './validation.js';
import {normalizeQuote} from './odds.js';
// Explicit reviewed mapping only. This provider supplies team/player names rather
// than stable IDs, so its name tokens are scoped by provider (players by event).
export function mapProviderEvents(events,store,{rightsBasis,now=Date.now()}={}) {
 const quotes=[],quarantine=[];
 for(const e of events){try{
  const id=store.resolve('the-odds-api','event',e.id),s=store.scenario(id);
  assert(s,'Unmapped event');
  assert(store.resolve('the-odds-api','team',e.home_team)===s.teams[0].id&&store.resolve('the-odds-api','team',e.away_team)===s.teams[1].id,'Team orientation mapping mismatch');
  assert(Math.abs(Date.parse(e.commence_time)-Date.parse(s.start))<=60000,'Start time mismatch; review rescheduling');
  const eventQuotes=[];
  for(const b of e.bookmakers||[]){if(b.key!=='sportsbet')continue;for(const m of b.markets||[]){const market={h2h:'moneyline',spreads:'spread',totals:'total',player_points:'player_points',player_rebounds:'player_rebounds',player_assists:'player_assists',player_points_rebounds_assists:'player_pra'}[m.key];assert(market,'Unsupported provider market');
   for(const o of m.outcomes){const player=market.startsWith('player_');const selection=['moneyline','spread'].includes(market)?(o.name===e.home_team?'home':o.name===e.away_team?'away':null):o.name?.toLowerCase();
    const q={source:'the-odds-api',sourceEventId:e.id,eventId:id,bookmaker:b.key,snapshotId:`${e.id}:${m.last_update||b.last_update}`,observedAt:m.last_update||b.last_update,market,selection,price:o.price,period:'full_game',includesOvertime:true,rightsBasis};
    if(market!=='moneyline')q.line=o.point;
    if(player){q.playerId=store.resolve('the-odds-api','player',`${e.id}:${o.description}`);q.dnpRule='void';}
    eventQuotes.push(normalizeQuote(q,s,now));
   }
  }}quotes.push(...eventQuotes);
 }catch(error){quarantine.push({sourceEventId:e.id,reason:error.message});}}
 return {quotes,quarantine};
}
