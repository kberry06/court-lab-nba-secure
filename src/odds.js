import {assert,number,string,timestamp} from './validation.js';
export const markets=['moneyline','spread','total','player_points','player_rebounds','player_assists','player_pra'];
export function normalizeQuote(q,scenario,now=Date.now()) {
  assert(q && typeof q==='object','Quote required');
  for(const field of ['source','sourceEventId','eventId','bookmaker','snapshotId','selection','rightsBasis']) string(q[field],field);
  assert(q.eventId===scenario.id,'Unknown event: explicit mapping required');
  assert(markets.includes(q.market),'Unsupported market');
  assert(q.period==='full_game' && q.includesOvertime===true,'Only full game including overtime supported');
  timestamp(q.observedAt,'observedAt'); assert(Date.parse(q.observedAt)<=now+60000,'Future quote');
  assert(Date.parse(q.observedAt)<Date.parse(scenario.start),'Pregame quotes only');
  number(q.price,1.001,1000,'decimal odds');
  if(q.market!=='moneyline') number(q.line,-300,500,'line');
  if(['moneyline','spread'].includes(q.market)) assert(['home','away'].includes(q.selection),'Team selection must be home or away');
  else assert(['over','under'].includes(q.selection),'Selection must be over or under');
  if(q.market.startsWith('player_')) { assert(scenario.teams.some(t=>t.players.some(p=>p.id===q.playerId)),'Unknown player: explicit mapping required'); assert(q.dnpRule==='void','Only DNP-void player props supported'); }
  return {...q,observedAt:new Date(q.observedAt).toISOString(),receivedAt:new Date(now).toISOString()};
}
export function priceQuote(q,sim,scenario,now=Date.now()) {
  let values=sim.samples.margin, active=null;
  if(q.market==='moneyline') values=values.map(v=>q.selection==='home'?v:-v);
  if(q.market==='spread') values=values.map(v=>(q.selection==='home'?v:-v)+q.line);
  if(q.market==='total') values=sim.samples.total.map(v=>v-q.line);
  if(q.market.startsWith('player_')) { const p=sim.samples.players[q.playerId]; active=p.active; values=(q.market==='player_pra'?p.points.map((v,i)=>v+p.rebounds[i]+p.assists[i]):p[q.market.slice(7)]).map(v=>v-q.line); }
  if(q.selection==='under') values=values.map(v=>-v);
  let wins=0,losses=0,pushes=0,voids=0;
  values.forEach((v,i)=>{if(active&&!active[i])voids++;else if(v>0)wins++;else if(v<0)losses++;else pushes++;});
  const n=values.length,decisive=wins+losses,probability=decisive?wins/decisive:null;
  const stale=now-Date.parse(q.observedAt)>15*60000,started=now>=Date.parse(scenario.start);
  const inputsStale=now-Date.parse(scenario.asOf)>24*3600000;
  const eligible=!stale&&!started&&!inputsStale&&!scenario.demo;
  return {...q,stale,started,inputsStale,eligible,modelProbability:probability,fairOdds:wins?decisive/wins:null,pushProbability:pushes/n,voidProbability:voids/n,expectedReturn:(wins*(q.price-1)-losses)/n,edge:probability===null?null:probability-1/q.price};
}
export function addNoVig(quotes) {
  return quotes.map(q=>{const opposite=quotes.find(p=>p!==q&&p.source===q.source&&p.snapshotId===q.snapshotId&&p.eventId===q.eventId&&p.bookmaker===q.bookmaker&&p.market===q.market&&p.playerId===q.playerId&&p.observedAt===q.observedAt&&p.selection!==q.selection&&(q.market==='spread'?p.line===-q.line:p.line===q.line));
    return {...q,bookFairProbability:opposite?(1/q.price)/(1/q.price+1/opposite.price):null};});
}
// Documented aggregator endpoint only. No calls to Sportsbet websites or private APIs.
export async function fetchApprovedOdds(env=process.env,eventId=null) {
  assert(env.ODDS_PROVIDER==='the-odds-api' && env.ODDS_FEED_APPROVED==='true' && env.ODDS_API_KEY,'Feed disabled: approved contract and server secret required');
  assert(!eventId||/^[a-zA-Z0-9_-]+$/.test(eventId),'Invalid odds event ID');
  const url=new URL('https://api.the-odds-api.com/v4/sports/basketball_nba/'+(eventId?`events/${eventId}/odds`:'odds'));
  url.search=new URLSearchParams({apiKey:env.ODDS_API_KEY,bookmakers:'sportsbet',markets:eventId?'player_points,player_rebounds,player_assists,player_points_rebounds_assists':'h2h,spreads,totals',oddsFormat:'decimal',dateFormat:'iso'});
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  assert(response.ok,`Odds provider returned HTTP ${response.status}. Check subscription coverage or quota in your provider account.`);
  return response.json();
}
