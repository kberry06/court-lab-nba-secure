import {normalizeEvent,normalizePlayerLog} from './public-nba.js';
import {normalizeSettlement} from './settlement-data.js';
const ttl=5*60000;
export async function playerReview({nba,store,playerId,teamId,season,force=false,clock=Date.now}){
 const key=`player-review:v1:${playerId}:${teamId}:${season}`,old=store.cache(key);
 if(!force&&old&&clock()-old.savedAt<ttl)return old.body;
 const rows=new Map(),warnings=[];
 // Current final observations for review have no historical replay embargo.
 for(const year of [season,season-1]){
  const log=await nba.reviewBody(`athletes/${playerId}/gamelog?season=${year}`,force);
  for(const r of normalizePlayerLog(log,playerId,clock()))if(Number(r.min)>0&&[r.pts,r.reb,r.ast].every(x=>Number.isFinite(x)&&x>=0))rows.set(r.game.id,r);
  if(rows.size>=5)break;
 }
 const schedule=await nba.reviewBody(`teams/${teamId}/schedule?season=${season}&seasontype=2`,force);
 if(!Array.isArray(schedule.events))throw new Error('Recent team schedule unavailable');
 const latest=schedule.events.filter(e=>e.competitions?.[0]?.type?.id!=='39').map(normalizeEvent).filter(g=>g.status_state==='final'&&Date.parse(g.datetime)<clock()).sort((a,b)=>Date.parse(b.datetime)-Date.parse(a.datetime)).slice(0,3);
 for(const g of latest){
  try{
   const body=await nba.reviewBody(`summary?event=${g.id}`,force),final=normalizeSettlement(body,'espn:game:'+g.id,clock()),p=final.players.find(p=>p.id==='espn:player:'+playerId);
   if(!p){warnings.push(`Player record unavailable for completed game ${g.id}`);continue;}
   rows.delete(g.id);if(p.didNotPlay||p.minutes<=0)continue;
   const opponent=p.teamId===g.home_team.id?g.visitor_team:g.home_team;
   rows.set(g.id,{player:{id:playerId},game:{id:g.id,date:g.date,datetime:g.datetime,final:true},min:p.minutes,pts:p.points,reb:p.rebounds,ast:p.assists,opponent:{abbreviation:opponent.abbreviation,name:opponent.full_name},provenance:'verified-final-box'});
  }catch{warnings.push(`Final box not verified yet for game ${g.id}`);}
 }
 const recent=[...rows.values()].sort((a,b)=>Date.parse(b.game.datetime)-Date.parse(a.game.datetime)).slice(0,10).map(r=>({gameId:r.game.id,datetime:r.game.datetime,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.game.datetime)),opponent:r.opponent?.abbreviation||r.opponent?.name||'Opponent',minutes:Number(r.min),points:r.pts,rebounds:r.reb,assists:r.ast,source:r.provenance}));
 const result={playerId:'espn:player:'+playerId,checkedAt:new Date(clock()).toISOString(),cacheMinutes:5,recent,warnings,reviewOnly:true};store.saveCache(key,result);return result;
}
