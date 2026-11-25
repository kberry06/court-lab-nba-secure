import {availabilityHolds} from './availability.js';
import {currentQuote,confidence,propReviewReasons,projectionDifference,marketLabels} from './odds-view.js';
export const SHORTLIST_POLICY='official-injury-review-1-extreme-hold-1';

const mainMarkets={spreads:'spread',totals:'total',player_points:'player_points',player_rebounds:'player_rebounds',player_assists:'player_assists',player_points_rebounds_assists:'player_pra',player_points_assists:'player_pa',player_rebounds_assists:'player_ra',player_points_rebounds:'player_pr'};
const family=q=>q.market?.startsWith('player_')?'props':q.market;
const groupKey=q=>JSON.stringify([q.eventId,q.playerId||'',q.market]);
const identity=q=>JSON.stringify([q.source,q.bookmaker,q.eventId,q.playerId||'',q.market,q.providerMarket,q.selection,q.line,q.price,q.observedAt,q.snapshotId]);
const approvedMain=q=>q.source==='the-odds-api'&&q.ingestMethod==='approved-provider'&&q.bookmaker==='sportsbet'&&mainMarkets[q.providerMarket]===q.market;

// Rank individual decisive-outcome probabilities. Do not convert the shortlist
// into a multi probability: player and game outcomes can be correlated.
export function mostProbableSelections(quotes,result,scenario,{now=Date.now(),limit=4,marketFamily='all',currentQuotes=quotes}={}){
 const empty=reason=>({policy:SHORTLIST_POLICY,selections:[],available:0,target:limit,reason});
 if(scenario?.demo)return empty('Synthetic scenarios are excluded.');
 if(!result||result.propSummaryVersion!==2||result.eventId!==scenario.id||result.asOf!==scenario.asOf)return empty('Refresh the saved projection before ranking selections.');
 if(!Number.isFinite(Date.parse(scenario.start))||now>=Date.parse(scenario.start))return empty('Pregame selections close at tip-off.');
 if(!Number.isFinite(Date.parse(scenario.asOf))||Date.parse(scenario.asOf)>now||now-Date.parse(scenario.asOf)>24*3600000)return empty('Refresh projection inputs before ranking selections.');
 const injuryHolds=availabilityHolds(scenario,now);if(injuryHolds.length)return empty('Selections held: '+injuryHolds.join('; '));
 const groups=new Map();
 for(const q of currentQuotes||[]){
  const at=Date.parse(q.observedAt);
  if(!approvedMain(q)||q.eventId!==scenario.id||!Number.isFinite(at)||at>now||at>=Date.parse(scenario.start)||marketFamily!=='all'&&family(q)!==marketFamily)continue;
  const key=groupKey(q),old=groups.get(key);
  if(!old||at>old.at)groups.set(key,{at,quotes:[q]});else if(at===old.at)old.quotes.push(q);
 }
 const priced=new Map((quotes||[]).map(q=>[identity(q),q])),candidates=[];
 for(const group of groups.values()){
  // A provider should supply one main threshold per market at a time. Ambiguous
  // same-time thresholds are held out rather than treating them as main lines.
  const lines=new Set(group.quotes.map(q=>q.market==='spread'?Math.abs(q.line):q.line));if(lines.size!==1)continue;
  const sides=[];
  for(const raw of group.quotes){
   const saved=priced.get(identity(raw));if(!saved)continue;const q=currentQuote(saved,scenario,now);
   if(!q.eligible||q.stale||q.started||q.inputsStale||q.period!=='full_game'||q.includesOvertime!==true||!Number.isFinite(q.line)||!Number.isFinite(q.price)||q.price<=1||!Number.isFinite(q.modelProbability)||q.modelProbability<.5||q.modelProbability>1)continue;
   // Extreme raw estimates have failed the forward audit. Preserve them in the
   // quote ledger, but do not feature them as selections without validation.
   if(Math.round(q.modelProbability*1000)>=900&&q.distributionValidated!==true)continue;
   if(q.market==='spread'?!['home','away'].includes(q.selection):!['over','under'].includes(q.selection))continue;
   if(q.market.startsWith('player_')?(!q.playerId||q.dnpRule!=='void'||q.line<0):(q.playerId||q.market==='total'&&q.line<0))continue;
   const reasons=propReviewReasons(q,result,scenario,now),material=reasons.filter(r=>!r.startsWith('Final player distributions are not calibrated;'));
   if(material.length)continue;
   const difference=projectionDifference(q,result);if(!Number.isFinite(difference.projection))continue;
   const team=q.playerId?scenario.teams.find(t=>t.players.some(p=>p.id===q.playerId)):q.market==='spread'?scenario.teams[q.selection==='home'?0:1]:null;
   const player=team?.players.find(p=>p.id===q.playerId);
   sides.push({...q,reviewReasons:reasons,confidence:confidence({...q,reviewReasons:reasons}),name:player?.name||team?.name||'Game total',teamName:team?.name||null,marketLabel:marketLabels[q.market],projection:difference.projection,variance:difference.difference});
  }
  sides.sort(compare);if(sides.length)candidates.push(sides[0]);
 }
 candidates.sort(compare);
 const distinct=[],players=new Map();
 for(const candidate of candidates){
  if(candidate.playerId&&players.has(candidate.playerId)){players.get(candidate.playerId).relatedProps.push(candidate);continue;}
  const selection={...candidate,relatedProps:[]};distinct.push(selection);if(candidate.playerId)players.set(candidate.playerId,selection);
 }
 return {policy:SHORTLIST_POLICY,selections:distinct.slice(0,Math.max(0,Math.min(4,limit))),available:distinct.length,target:limit,reason:distinct.length<limit?'Fewer than four distinct selections qualify (one prop per player). Unvalidated 90%+ estimates are held for calibration review. Refresh Sportsbet odds and the projection in this matchup.':null};
}
function compare(a,b){return b.modelProbability-a.modelProbability||(b.expectedReturn??-Infinity)-(a.expectedReturn??-Infinity)||Date.parse(b.observedAt)-Date.parse(a.observedAt)||groupKey(a).localeCompare(groupKey(b))||a.selection.localeCompare(b.selection);}
