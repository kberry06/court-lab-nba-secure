import {estimatePlayer} from './player-estimator.js';
import {simulate,rng} from './model.js';
export const allocationKeys=['minutes','points','rebounds','assists','pra','pa','ra','pr'];
const components=['points','rebounds','assists'];
const totals=p=>({...p,pra:p.points+p.rebounds+p.assists,pa:p.points+p.assists,ra:p.rebounds+p.assists,pr:p.points+p.rebounds});
export function appearanceEstimate(rows,window=10){const past=rows.slice(0,window);return (1+past.filter(r=>r.minutes>0&&!r.didNotPlay).length)/(2+past.length);}
export function allocateExpectedMinutes(players,{participation=false}={}){
 const weights=players.map(p=>p.minutes*(participation?p.availability:1)),out=weights.map(()=>0);let left=240,open=weights.map((_,i)=>i).filter(i=>weights[i]>0);
 if(open.length<5)throw new Error('Fewer than five players with positive minute weights');
 while(open.length){const sum=open.reduce((n,i)=>n+weights[i],0),capped=open.filter(i=>left*weights[i]/sum>=48);if(!capped.length){for(const i of open)out[i]=left*weights[i]/sum;break;}for(const i of capped){out[i]=48;left-=48;}open=open.filter(i=>!capped.includes(i));}
 return out;
}
export function proxyRoster(state,teamId,cutoff){const roster=state.rosters.get(teamId);if(!roster)return null;if(roster.at>=cutoff)throw new Error('Roster snapshot must predate cutoff');return {...roster,players:roster.players.filter(p=>!state.lastTeam?.has(p.id)||state.lastTeam.get(p.id)===teamId)};}
export function createAllocationState(){return {history:new Map(),listed:new Map(),rosters:new Map(),lastTeam:new Map(),league:{minutes:0,points:0,rebounds:0,assists:0}};}
export function releaseBefore(state,pending,cutoff,embargoHours=24){while(pending.length&&Date.parse(pending[0][0].datetime)+embargoHours*3600000<cutoff)releasePlayerGame(state,pending.shift());}
export function releasePlayerGame(state,rows){
 const teams=new Map();for(const r of rows){state.lastTeam.set(r.playerId,r.teamId);if(!teams.has(r.teamId))teams.set(r.teamId,[]);teams.get(r.teamId).push(r);const listed=state.listed.get(r.playerId)||[];listed.unshift(r);listed.splice(20);state.listed.set(r.playerId,listed);
  if(r.minutes>0&&!r.didNotPlay){const h=state.history.get(r.playerId)||[];h.unshift({minutes:r.minutes,points:r.points,rebounds:r.rebounds,assists:r.assists});h.splice(20);state.history.set(r.playerId,h);state.league.minutes+=r.minutes;for(const k of components)state.league[k]+=r[k];}}
 for(const [teamId,roster] of teams)state.rosters.set(teamId,{at:Date.parse(rows[0].datetime),players:roster.map(r=>({id:r.playerId,name:r.name}))});
}
export function buildReplayTeam(state,team,cutoff,parameters,{candidate=false}={}){
 const roster=proxyRoster(state,team.id,cutoff);if(!roster)return null;
 const players=roster.players.map(p=>{const history=state.history.get(p.id)||[],estimated=estimatePlayer(history,parameters);return {id:'espn:player:'+p.id,numericId:p.id,name:p.name||String(p.id),minutes:estimated.minutes,rawMinutes:estimated.minutes,availability:candidate?appearanceEstimate(state.listed.get(p.id)||[]):1,impact:0,points:estimated.points,rebounds:estimated.rebounds,assists:estimated.assists};}).sort((a,b)=>b.minutes-a.minutes).slice(0,20);
 if(players.length<6)return null;
 // These are plug-in marginal means, not a substitute for the full draw-level audit.
 const marginal=allocateExpectedMinutes(players,{participation:candidate});
 const normalized=players.map((p,i)=>({...p,minutes:candidate?Math.min(48,marginal[i]/p.availability):marginal[i]}));
 return {id:'espn:team:'+team.id,name:team.full_name,pace:100,offense:114,defense:114,restDays:2,players:normalized,rosterAgeDays:(cutoff-roster.at)/86400000,pluginMinutes:marginal,rawPlayers:players};
}
export function pluginProjection(team,score){
 const raw=team.rawPlayers,mins=team.pluginMinutes,weights=raw.map((p,i)=>mins[i]*p.points),sum=weights.reduce((a,b)=>a+b,0);
 return raw.map((p,i)=>({id:p.numericId,raw:totals({minutes:p.rawMinutes,...Object.fromEntries(components.map(k=>[k,p.rawMinutes*p[k]]))}),final:totals({minutes:mins[i],points:score*weights[i]/sum,rebounds:mins[i]*p.rebounds,assists:mins[i]*p.assists}),availability:p.availability,roleMinutes:p.rawMinutes}));
}
export const newErrorAccumulator=()=>({players:0,positiveAppearances:0,absolute:Object.fromEntries(allocationKeys.map(k=>[k,0])),bias:Object.fromEntries(allocationKeys.map(k=>[k,0]))});
export function addPlayerError(acc,predicted,actual){if(!allocationKeys.every(k=>Number.isFinite(totals(predicted)[k])))throw new Error('Non-finite allocated projection');const p=totals(predicted),a=totals(actual);acc.players++;if(actual.minutes>0)acc.positiveAppearances++;for(const k of allocationKeys){acc.absolute[k]+=Math.abs(p[k]-a[k]);acc.bias[k]+=p[k]-a[k];}}
export const finishErrors=acc=>({players:acc.players,positiveAppearances:acc.positiveAppearances,mae:Object.fromEntries(allocationKeys.map(k=>[k,acc.players?acc.absolute[k]/acc.players:null])),bias:Object.fromEntries(allocationKeys.map(k=>[k,acc.players?acc.bias[k]/acc.players:null]))});
export function deterministicGameHash(id){let n=Number(id)>>>0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;}
export function evaluateDraws(scenario,actualRows,seed){
 const result=simulate(scenario,{seed}),index=new Map(actualRows.map(r=>['espn:player:'+r.playerId,r])),all=newErrorAccumulator(),active=newErrorAccumulator(),raw=newErrorAccumulator();let eligible=0,participationBrier=0,pointCoverage=0,pointCoverageN=0;const errors=[];
 for(const p of result.players){const actual=index.get(p.id);if(!actual)continue;const input=scenario.teams.flatMap(t=>t.players).find(x=>x.id===p.id);eligible++;participationBrier+=(p.appearanceProbability-Number(actual.minutes>0))**2;
  const values=Object.fromEntries(['minutes',...components].map(k=>[k,p[k].mean]));addPlayerError(all,values,actual);
  if(actual.minutes>0&&p.conditional.points.mean!==null){const predicted=Object.fromEntries(['minutes',...components].map(k=>[k,p.conditional[k].mean]));addPlayerError(active,predicted,actual);const r=totals({minutes:input.rawMinutes,...Object.fromEntries(components.map(k=>[k,input.rawMinutes*input[k]]))});addPlayerError(raw,r,actual);pointCoverage+=Number(actual.points>=p.conditional.points.p10&&actual.points<=p.conditional.points.p90);pointCoverageN++;}
  errors.push({playerId:p.id,pointsAbsolute:Math.abs(p.points.mean-actual.points),praAbsolute:Math.abs(p.points.mean+p.rebounds.mean+p.assists.mean-actual.points-actual.rebounds-actual.assists)});
 }
 return {all,active,raw,participation:{n:eligible,brierSum:participationBrier},interval:{n:pointCoverageN,covered:pointCoverage},errors};
}
export function pairedAllocationBootstrap(rows,{draws=1000,seed=637}={}){
 const days=new Map();for(const r of rows){if(!days.has(r.date))days.set(r.date,[]);days.get(r.date).push(r);}const blocks=[...days.values()],random=rng(seed),out=[];
 if(!blocks.length)return null;for(let i=0;i<draws;i++){let sum=0,n=0;for(let j=0;j<blocks.length;j++){const block=blocks[Math.floor(random()*blocks.length)];for(const r of block){sum+=r.difference;n++;}}out.push(sum/n);}out.sort((a,b)=>a-b);
 return {method:'Paired UTC-day cluster bootstrap; candidate minus baseline point absolute error',days:blocks.length,draws,difference:rows.reduce((n,r)=>n+r.difference,0)/rows.length,interval95:[out[Math.floor(draws*.025)],out[Math.floor(draws*.975)]]};
}
