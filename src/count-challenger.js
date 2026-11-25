import {rng,normal} from './model.js';
import {COUNT_VERSION,countStats,validateCountModel,poisson,scoreAllocation,rateShocks} from './player-count-model.js';
const summary=values=>{if(!values.length)return {mean:null,p10:null,p50:null,p90:null};const sorted=[...values].sort((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b,0)/values.length,p10:sorted[Math.floor(values.length*.1)],p50:sorted[Math.floor(values.length*.5)],p90:sorted[Math.floor(values.length*.9)]};};
// Consumes the research rotation's samples. The incumbent is never modified.
// Team scores are taken from the incumbent; player totals remain coherent.
export function countChallenger(scenario,incumbent,rotation,artifact,{seed=7381}={}){
 validateCountModel(artifact,scenario.asOf);
 if(incumbent.draws!==10000||rotation.draws!==10000||incumbent.eventId!==scenario.id||rotation.eventId!==scenario.id)throw new Error('Matched 10,000-draw simulations required');
 const random=rng(seed),samples=rotation.samples,players=scenario.teams.flatMap(t=>t.players);
 for(let d=0;d<10000;d++){
  const pace=(scenario.teams[0].pace+scenario.teams[1].pace)/200;
  for(let side=0;side<2;side++){
   const team=scenario.teams[side],shocks=team.players.map(()=>rateShocks(artifact.lower,random,normal)),weights=team.players.map((p,i)=>samples.players[p.id].minutes[d]*p.points*shocks[i][0]);
   const allocated=scoreAllocation(incumbent.samples.scores[side][d],weights,random);
   team.players.forEach((p,i)=>{const v=samples.players[p.id],m=v.minutes[d];v.points[d]=allocated[i];for(const [index,stat] of ['rebounds','assists'].entries())v[stat][d]=m>0?poisson(m*p[stat]*pace*artifact.rateCorrection[stat]*shocks[i][index+1],random):0;});
  }
 }
 const result={...rotation,modelVersion:COUNT_VERSION+(scenario.availabilityInputVersion==='official-injury-review-1'?'-injury-1':''),inputPolicyVersion:scenario.availabilityInputVersion||null,generatedAt:new Date().toISOString(),shadowOnly:true,distributionValidated:false,countTrainingLastSettledAt:artifact.trainingLastSettledAt,gameForecastSource:'Linked incumbent simulation',homeWin:incumbent.homeWin,mc95HalfWidth:incumbent.mc95HalfWidth,home:incumbent.home,away:incumbent.away,margin:incumbent.margin,total:incumbent.total};
 result.players=players.map(p=>{const v=samples.players[p.id],prior=rotation.players.find(x=>x.id===p.id),conditional=Object.fromEntries([...countStats,'minutes'].map(k=>[k,summary(v[k].filter((_,i)=>v.active[i]))]));return {...prior,conditional,thresholds:Object.fromEntries([['points',20],['rebounds',8],['assists',5]].map(([stat,line])=>{const active=v.active.filter(Boolean).length;return [stat,{line,probability:active?v[stat].filter((n,i)=>v.active[i]&&n>=line).length/active:null}];})),...Object.fromEntries([...countStats,'minutes'].map(k=>[k,summary(v[k])]))};});
 result.samples={...samples,scores:incumbent.samples.scores,margin:incumbent.samples.margin,total:incumbent.samples.total};return result;
}
