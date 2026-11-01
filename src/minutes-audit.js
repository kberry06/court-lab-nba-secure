import {livePerformance} from './live-performance.js';
const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
export function minutesAudit(report){
 return report.models.map(m=>{
  const players=report.rows.filter(r=>r.modelVersion===m.modelVersion&&r.status==='settled').flatMap(r=>r.players.map(p=>({...p,eventId:r.eventId,date:r.sydneyDate})));
  const observed=players.filter(p=>Number.isFinite(p.errors.minutes));
  const groups=[...new Set(observed.flatMap(p=>p.minuteContext?.flags||['Context unavailable']))].map(label=>{const ps=observed.filter(p=>(p.minuteContext?.flags||['Context unavailable']).includes(label));return {label,n:ps.length,mae:avg(ps.map(p=>Math.abs(p.errors.minutes))),bias:avg(ps.map(p=>p.errors.minutes))};});
  return {modelVersion:m.modelVersion,n:observed.length,groups,participation:{observed:players.length,dnp:players.filter(p=>!p.played).length,unexpectedDnp:players.filter(p=>!p.played&&p.appearanceProbability>=.8).length,lowProbabilityPlayed:players.filter(p=>p.played&&p.appearanceProbability<.5).length},largest:observed.sort((a,b)=>Math.abs(b.errors.minutes)-Math.abs(a.errors.minutes)).slice(0,15).map(p=>({name:p.name,eventId:p.eventId,date:p.date,predicted:p.predicted.minutes,actual:p.actual.minutes,error:p.errors.minutes,context:p.minuteContext}))};
 });
}
// Compare the shadow against its linked contemporaneous default, never an older
// first-default forecast. No forecasts are reconstructed from postgame inputs.
export function pairedShadowPerformance(records,{now=Date.now(),days=30}={}){
 const rows=[],seen=new Set();let rejected=0;
 for(const r of records){if(seen.has(r.eventId))continue;const a=r.incumbent,b=r.shadow;
  if(!a||!b||a.scenario.id!==r.eventId||b.scenario.id!==r.eventId||a.scenario.asOf!==b.scenario.asOf||Date.parse(a.createdAt)>=Date.parse(a.scenario.start)||Date.parse(b.createdAt)>=Date.parse(b.scenario.start)||JSON.stringify(a.scenario.teams.map(t=>[t.id,t.players.map(p=>p.id)]))!==JSON.stringify(b.scenario.teams.map(t=>[t.id,t.players.map(p=>p.id)]))||Date.parse(b.createdAt)-Date.parse(a.createdAt)>120000||Date.parse(b.createdAt)<Date.parse(a.createdAt)){rejected++;continue;}
  seen.add(r.eventId);
  for(const [label,run] of [['default',a],['shadow',b]])rows.push({eventId:r.eventId,start:run.scenario.start,frozenAt:run.createdAt,trainingCutoff:run.scenario.asOf,synthetic:false,probability:run.summary.homeWin,predictedHome:run.summary.home.mean,predictedAway:run.summary.away.mean,modelVersion:label,settledAt:r.settledAt,fullOutcome:r.outcome,run:{...run,summary:{...run.summary,modelVersion:label}}});
 }
 const report=livePerformance(rows,{now,days}),cases=[];
 for(const a of report.rows.filter(r=>r.modelVersion==='default'&&r.status==='settled')){const b=report.rows.find(r=>r.eventId===a.eventId&&r.modelVersion==='shadow'&&r.status==='settled');if(!b)continue;for(const p of a.players){const q=b.players.find(q=>q.id===p.id);if(q&&[p.errors.minutes,q.errors.minutes,p.errors.points,q.errors.points].every(Number.isFinite))cases.push({eventId:a.eventId,defaultMinutes:Math.abs(p.errors.minutes),shadowMinutes:Math.abs(q.errors.minutes),defaultPoints:Math.abs(p.errors.points),shadowPoints:Math.abs(q.errors.points)});}}
 return {games:report.models.find(m=>m.modelVersion==='default')?.games||0,settledGames:new Set(cases.map(c=>c.eventId)).size,n:cases.length,rejected,defaultMinuteMAE:avg(cases.map(c=>c.defaultMinutes)),shadowMinuteMAE:avg(cases.map(c=>c.shadowMinutes)),defaultPointMAE:avg(cases.map(c=>c.defaultPoints)),shadowPointMAE:avg(cases.map(c=>c.shadowPoints)),minimumGames:100,promotionReady:false,note:'Research only. Same input observation and linked runs within two minutes; identical observed player cases. No automatic promotion; evaluate coverage, uncertainty and the 4.5-minute gate after at least 100 games.'};
}
