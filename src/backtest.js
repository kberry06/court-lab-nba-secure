import {assert,number,string,timestamp} from './validation.js';
import {rng} from './model.js';
const clamp=p=>Math.min(.999,Math.max(.001,p));
const logit=p=>Math.log(clamp(p)/(1-clamp(p)));
const sigmoid=x=>1/(1+Math.exp(-x));
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
// Calibration is fitted only on earlier, settled out-of-sample predictions.
function calibrator(rows) { let a=0,b=1; if(rows.length<30)return p=>p;for(let k=0;k<300;k++){let da=0,db=0;for(const r of rows){const x=logit(r.raw),e=sigmoid(a+b*x)-r.y;da+=e;db+=e*x;}a-=.05*(da/rows.length+.02*a);b-=.05*(db/rows.length+.02*(b-1));}return p=>clamp(sigmoid(a+b*logit(p))); }
function metrics(rows,key) {return {brier:avg(rows.map(r=>(r[key]-r.y)**2)),logLoss:avg(rows.map(r=>-r.y*Math.log(clamp(r[key]))-(1-r.y)*Math.log(1-clamp(r[key])))),accuracy:avg(rows.map(r=>+(r[key]>=.5===(r.y===1))))};}
export function walkForward(input,{minTrain=30,embargoHours=24}={}) {
  assert(Array.isArray(input)&&input.length>=minTrain+10&&input.length<=10000,'Need 40–10,000 historical frozen prediction rows');
  const ids=new Set();const rows=input.map(r=>{string(r.eventId,'event ID');assert(!ids.has(r.eventId),'Duplicate event ID');ids.add(r.eventId);for(const k of ['start','frozenAt','settledAt','trainingCutoff'])timestamp(r[k],k);assert(Date.parse(r.trainingCutoff)<=Date.parse(r.frozenAt)&&Date.parse(r.frozenAt)<Date.parse(r.start)&&Date.parse(r.start)<Date.parse(r.settledAt),'Leakage: training/freeze/start/settlement order invalid');number(r.probability,0,1,'probability');number(r.actualHome,0,250,'actual home');number(r.actualAway,0,250,'actual away');assert(r.actualHome!==r.actualAway,'Final NBA scores cannot tie');number(r.predictedHome,0,250,'predicted home');number(r.predictedAway,0,250,'predicted away');string(r.modelVersion,'model version');assert(typeof r.synthetic==='boolean','synthetic flag required');return {...r,raw:clamp(r.probability),y:+(r.actualHome>r.actualAway)};}).sort((a,b)=>Date.parse(a.frozenAt)-Date.parse(b.frozenAt));
  const evaluated=[];
  for(const row of rows) { const cutoff=Date.parse(row.frozenAt)-embargoHours*3600000;const train=rows.filter(r=>Date.parse(r.settledAt)<cutoff&&Date.parse(r.frozenAt)<Date.parse(row.frozenAt));if(train.length<minTrain)continue;const cal=calibrator(train);evaluated.push({...row,calibrated:cal(row.raw),baseline:avg(train.map(r=>r.y)),trainCount:train.length,calibrationCutoff:new Date(cutoff).toISOString()}); }
  assert(evaluated.length>=10,'At least 10 eligible holdout games needed after embargo');
  const bins=Array.from({length:10},(_,i)=>{const rs=evaluated.filter(r=>Math.min(9,Math.floor(r.calibrated*10))===i);return {lower:i/10,count:rs.length,predicted:rs.length?avg(rs.map(r=>r.calibrated)):null,observed:rs.length?avg(rs.map(r=>r.y)):null};});
  // Day-cluster bootstrap keeps same-day games together.
  const days=Object.groupBy(evaluated,r=>r.start.slice(0,10));const blocks=Object.values(days),random=rng(919),bootstrap=[];
  for(let i=0;i<1000;i++){const sample=blocks.flatMap(()=>blocks[Math.floor(random()*blocks.length)]);bootstrap.push(metrics(sample,'calibrated').brier);}bootstrap.sort((a,b)=>a-b);
  const folds=Object.entries(Object.groupBy(evaluated,r=>r.start.slice(0,7))).map(([month,rs])=>({month,count:rs.length,...metrics(rs,'calibrated')}));
  return {createdAt:new Date().toISOString(),kind:'frozen-prediction walk-forward calibration audit',synthetic:rows.some(r=>r.synthetic),count:evaluated.length,skipped:rows.length-evaluated.length,embargoHours,raw:metrics(evaluated,'raw'),calibrated:metrics(evaluated,'calibrated'),baseline:metrics(evaluated,'baseline'),brier95:[bootstrap[25],bootstrap[974]],teamMAE:avg(evaluated.map(r=>(Math.abs(r.predictedHome-r.actualHome)+Math.abs(r.predictedAway-r.actualAway))/2)),marginMAE:avg(evaluated.map(r=>Math.abs((r.predictedHome-r.predictedAway)-(r.actualHome-r.actualAway)))),bins,folds,predictions:evaluated.map(({eventId,raw,calibrated,y,trainCount,calibrationCutoff})=>({eventId,raw,calibrated,y,trainCount,calibrationCutoff})),limitations:'Audits supplied immutable pregame predictions, not a refit of the simulation model. Timestamp assertions cannot prove external provenance. No real accuracy claim until licensed historical snapshots and independent holdout evaluation exist.'};
}
