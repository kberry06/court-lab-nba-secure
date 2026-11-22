import {livePerformance} from './live-performance.js';
import {caseWeights,calibrationMetrics} from './market-calibration.js';
const day=86400000,avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const keys={minutes:['minutes'],points:['points'],rebounds:['rebounds'],assists:['assists'],pra:['points','rebounds','assists'],pa:['points','assists'],ra:['rebounds','assists'],pr:['points','rebounds']};
function clusterInterval(rows){
 const groups=new Map();for(const r of rows){const g=groups.get(r.date)||{sum:0,n:0};g.sum+=r.error;g.n++;groups.set(r.date,g);}
 if(groups.size<5)return null;
 let seed=924;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;},blocks=[...groups.values()],draws=[];
 for(let i=0;i<500;i++){let sum=0,n=0;for(let j=0;j<blocks.length;j++){const g=blocks[Math.floor(random()*blocks.length)];sum+=g.sum;n+=g.n;}draws.push(sum/n);}
 draws.sort((a,b)=>a-b);return [draws[12],draws[487]];
}
function metric(players,metric){
 const fields=keys[metric],rows=players.flatMap(p=>{if(!p.played||!fields.every(k=>Number.isFinite(p.predicted[k])&&Number.isFinite(p.actual[k])))return [];const predicted=fields.reduce((n,k)=>n+p.predicted[k],0),actual=fields.reduce((n,k)=>n+p.actual[k],0);return [{...p,prediction:predicted,observation:actual,error:predicted-actual}];}),coverage=rows.filter(p=>typeof p.covered[metric]==='boolean');
 return {n:rows.length,games:new Set(rows.map(r=>r.eventId)).size,days:new Set(rows.map(r=>r.date)).size,mae:avg(rows.map(r=>Math.abs(r.error))),bias:avg(rows.map(r=>r.error)),biasInterval95:clusterInterval(rows),underPredictionShare:avg(rows.map(r=>Number(r.error<0))),coverage80:avg(coverage.map(r=>Number(r.covered[metric]))),coverageCases:coverage.length,largest:rows.sort((a,b)=>Math.abs(b.error)-Math.abs(a.error)).slice(0,10).map(r=>({eventId:r.eventId,date:r.date,playerId:r.id,name:r.name,predicted:r.prediction,actual:r.observation,error:r.error,predictedMinutes:r.predicted.minutes,actualMinutes:r.actual.minutes}))};
}
function decomposition(players,stat){
 const rows=players.filter(p=>p.played&&[p.predicted.minutes,p.actual.minutes,p.predicted[stat],p.actual[stat]].every(Number.isFinite)&&p.predicted.minutes>0&&p.actual.minutes>0).map(p=>{const predictedRate=p.predicted[stat]/p.predicted.minutes,actualRate=p.actual[stat]/p.actual.minutes,minutesContribution=(p.predicted.minutes-p.actual.minutes)*predictedRate,productionContribution=p.actual.minutes*(predictedRate-actualRate);return {error:p.predicted[stat]-p.actual[stat],minutesContribution,productionContribution};});
 return {n:rows.length,bias:avg(rows.map(r=>r.error)),minutesContribution:avg(rows.map(r=>r.minutesContribution)),productionAndAllocationContribution:avg(rows.map(r=>r.productionContribution)),note:'Exact descriptive split using final projected stat/minute. Production includes rates, pace, score allocation and rounding; this is not a causal estimate.'};
}
function marketAudit(records,now,days){
 const canonical=new Map(),excluded={},omit=r=>excluded[r]=(excluded[r]||0)+1;
 for(const r of records){
  if(!r.family?.startsWith('player_')||Date.parse(r.start)<now-days*day||Date.parse(r.start)>now)continue;
  if(!r.eligibleForCalibration||r.variant!=='default'){omit('ineligible provenance or adjusted scenario');continue;}
  if(![r.forecastAt,r.start,r.quoteObservedAt,r.quoteReceivedAt].every(x=>Number.isFinite(Date.parse(x)))||!(Date.parse(r.forecastAt)<Date.parse(r.start))||Date.parse(r.quoteObservedAt)>Date.parse(r.forecastAt)||Date.parse(r.quoteReceivedAt)>Date.parse(r.forecastAt)||Date.parse(r.forecastAt)-Date.parse(r.quoteObservedAt)>15*60000||!Number.isFinite(r.probability)||r.probability<0||r.probability>1){omit('invalid cutoff or probability');continue;}
  if(!r.result||!['win','loss','push','void'].includes(r.result.status)||!Number.isFinite(Date.parse(r.settledAt))||Date.parse(r.settledAt)>now){omit('unresolved or not settled by audit cutoff');continue;}
  const key=JSON.stringify([r.modelKey,r.eventId,r.playerId,r.family,r.selection,r.line]),old=canonical.get(key),distance=Math.abs(r.horizonMinutes-60);
  if(!old||distance<Math.abs(old.horizonMinutes-60)||distance===Math.abs(old.horizonMinutes-60)&&r.forecastAt<old.forecastAt)canonical.set(key,r);
 }
 const selected=[...canonical.values()],groups=new Map();
 for(const r of selected){const key=JSON.stringify([r.modelKey,r.family,r.selection]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 return {excluded,scope:'One capture nearest one hour before tip per model/event/player/family/side/line. Historic main-versus-alternate provenance was not retained; thresholds can be correlated.',families:[...groups.values()].map(rows=>{
  const decisive=caseWeights(rows.filter(r=>['win','loss'].includes(r.result.status)).map(r=>({...r,y:Number(r.result.status==='win')}))),paired=decisive.filter(r=>Number.isFinite(r.bookFairProbability)),high=decisive.filter(r=>r.probability>=.7);
  return {modelKey:rows[0].modelKey,modelVersion:rows[0].modelVersion,family:rows[0].family,side:rows[0].selection,records:rows.length,games:new Set(rows.map(r=>r.eventId)).size,pushes:rows.filter(r=>r.result.status==='push').length,voids:rows.filter(r=>r.result.status==='void').length,model:calibrationMetrics(decisive),pairedModel:calibrationMetrics(paired),bookmaker:calibrationMetrics(paired,'bookFairProbability'),highProbability:{n:high.length,games:new Set(high.map(r=>r.eventId)).size,predicted:avg(high.map(r=>r.probability)),observed:avg(high.map(r=>r.y))}};
 })};
}
export function playerAudit(forecasts,matched,{now=Date.now(),days=7}={}){
 const report=livePerformance(forecasts,{now,days});
 const models=report.models.map(m=>{const players=report.rows.filter(r=>r.modelVersion===m.modelVersion&&r.status==='settled').flatMap(r=>r.players.map(p=>({...p,eventId:r.eventId,date:r.sydneyDate})));return {modelVersion:m.modelVersion,settledGames:m.settled,pendingGames:m.pending,coverage:m.players,metrics:Object.fromEntries(Object.keys(keys).map(k=>[k,metric(players,k)])),decomposition:Object.fromEntries(['points','rebounds','assists'].map(k=>[k,decomposition(players,k)])),cohorts:[['Projected 28+ minutes',p=>p.predicted.minutes>=28],['Projected below 20 minutes',p=>p.predicted.minutes<20],['Reduced assumed availability',p=>p.minuteContext?.availability<1]].map(([label,filter])=>({label,minutes:metric(players.filter(filter),'minutes'),points:metric(players.filter(filter),'points')}))};});
 return {generatedAt:new Date(now).toISOString(),days,since:report.since,timezone:'Australia/Sydney',readCoverage:{forecasts:forecasts.readCoverage||null,matched:matched.readCoverage||null},models,markets:marketAudit(matched,now,days),limitations:['Original frozen forecasts only; no retrospective predictions or zero-filled missing players. Model versions and market fingerprints stay separate.','Mean error is projection minus actual. Negative bias means underprediction. Intervals resample Sydney days; fewer than five days has no interval.','Combo mean errors use sums of component means; no combo interval coverage is fabricated from marginal ranges.','Historical displayed shortlists were not frozen. High-probability quote bands are not an audit of the exact cards previously displayed.','Reporting limits are explicit. If truncated, use a shorter window; this diagnostic does not promote or calibrate a model.']};
}
