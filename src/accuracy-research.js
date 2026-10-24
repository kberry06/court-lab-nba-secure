import {fitRegression,predictRegression,sigmoid,logit} from './regression.js';
import {historicalFeatures} from './accuracy-features.js';
import {metrics} from './historical-model.js';
import {rng} from './model.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),average=a=>a.reduce((n,x)=>n+x,0)/a.length;
const loss=rows=>average(rows.map(r=>-(r.y*Math.log(clamp(r.probability,1e-6,1-1e-6))+(1-r.y)*Math.log(clamp(1-r.probability,1e-6,1-1e-6)))));
export function fitProbabilityCalibration(rows){
 let intercept=0,slope=1;if(rows.length<100)return {intercept,slope};
 for(let i=0;i<250;i++){let da=0,db=0;for(const r of rows){const x=logit(r.probability),e=sigmoid(intercept+slope*x)-r.y;da+=e;db+=e*x;}intercept-=.1*(da/rows.length+.02*intercept);slope-=.1*(db/rows.length+.02*(slope-1));}
 return {intercept,slope};
}
const calibrate=(p,c)=>sigmoid(c.intercept+c.slope*logit(p));
function marginScale(rows){
 if(rows.length<100)return 8;let selected=8,best=Infinity;
 // Fit the full conditional margin density on earlier out-of-sample games, including its tails.
 // Location = scale * logit(p), so the sampled winner probability remains exactly p.
 for(let scale=4;scale<=15;scale+=.25){let score=0;for(const r of rows){const z=r.actualMargin/scale-logit(r.probability);score+=Math.log(scale)+Math.abs(z)+2*Math.log1p(Math.exp(-Math.abs(z)));}if(score<best){best=score;selected=scale;}}
 return selected;
}
const totalFeatures=['leagueTotal','offTotal','defTotal','rest','backToBack'];
const distributionMetrics=rows=>({...metrics(rows),marginCentral80Coverage:average(rows.map(r=>Number(Math.abs(r.actualMargin-r.expectedMargin)<=r.marginScale*Math.log(9)))),totalCentral80Coverage:average(rows.map(r=>Number(Math.abs(r.actualTotal-r.expectedTotal)<=r.totalSd*1.2815515655)))});
export function pairedBootstrap(candidate,baseline,{draws=1000,seed=6221}={}){
 const index=new Map(baseline.map(r=>[r.id,r])),days=new Map();
 for(const r of candidate){const b=index.get(r.id);if(!b)throw new Error('Benchmark games must match');const date=r.datetime.slice(0,10);if(!days.has(date))days.set(date,[]);days.get(date).push((r.probability-r.y)**2-(b.probability-b.y)**2);}
 const blocks=[...days.values()].map(xs=>({sum:xs.reduce((a,b)=>a+b,0),n:xs.length})),random=rng(seed),values=[];
 for(let i=0;i<draws;i++){let sum=0,n=0;for(let j=0;j<blocks.length;j++){const b=blocks[Math.floor(random()*blocks.length)];sum+=b.sum;n+=b.n;}values.push(sum/n);}values.sort((a,b)=>a-b);
 return {method:'paired UTC-day cluster bootstrap',days:blocks.length,draws,brierDifference:average(candidate.map(r=>{const b=index.get(r.id);return (r.probability-r.y)**2-(b.probability-b.y)**2;})),brierDifference95:[values[Math.floor(draws*.025)],values[Math.floor(draws*.975)]]};
}
export function runAccuracyResearch(games,baseline,protocol){
 const features=historicalFeatures(games),rows=features.rows,seasons=[...new Set(rows.map(r=>r.season))].sort(),variants=[];
 for(const [family,names] of Object.entries(protocol.gameFamilies))for(const ridge of protocol.ridgeValues){
  const raw=[],calibrated=[];
  for(const target of seasons.filter(s=>s>=protocol.innerValidationStarts)){
   const train=rows.filter(r=>r.season<target&&r.season>=target-protocol.trainingSeasonWindow),test=rows.filter(r=>r.season===target);
   const classifier=fitRegression(train,names,{logistic:true,ridge}),totalModel=fitRegression(train,totalFeatures,{target:'actualTotal',ridge:10}),calibration=fitProbabilityCalibration(raw),rawScale=marginScale(raw),calScale=marginScale(calibrated);
   const totalOffset=raw.length?average(raw.map(r=>r.actualTotal-r.rawExpectedTotal)):0,totalSd=raw.length?Math.sqrt(average(raw.map(r=>(r.actualTotal-r.expectedTotal)**2))):20;
   const base=test.map(r=>{const rawExpectedTotal=predictRegression(totalModel,r.features);return {...r,probability:predictRegression(classifier,r.features),rawExpectedTotal,expectedTotal:rawExpectedTotal+totalOffset,totalSd};});
   raw.push(...base.map(r=>({...r,expectedMargin:rawScale*logit(r.probability),marginScale:rawScale})));
   calibrated.push(...base.map(r=>{const probability=calibrate(r.probability,calibration);return {...r,probability,expectedMargin:calScale*logit(probability),marginScale:calScale};}));
  }
  variants.push({id:`${family}-ridge${ridge}-raw`,family,names,ridge,calibrated:false,rows:raw});variants.push({id:`${family}-ridge${ridge}-calibrated`,family,names,ridge,calibrated:true,rows:calibrated,rawRows:raw});
 }
 const heldOut=[],folds=[];
 for(const season of seasons.filter(s=>s>=protocol.outerEvaluationStarts)){
  const ranked=variants.map(v=>({v,score:loss(v.rows.filter(r=>r.season<season))})).sort((a,b)=>a.score-b.score),selected=ranked[0].v,test=selected.rows.filter(r=>r.season===season);
  heldOut.push(...test);const ids=new Set(test.map(r=>r.id));folds.push({season,selected:selected.id,selectionSeasons:seasons.filter(s=>s>=protocol.innerValidationStarts&&s<season),trainingSeasons:seasons.filter(s=>s<season&&s>=season-protocol.trainingSeasonWindow),metrics:distributionMetrics(test),baseline:metrics(baseline.filter(r=>ids.has(r.id)))});
 }
 const ids=new Set(heldOut.map(r=>r.id)),pairedBaseline=baseline.filter(r=>ids.has(r.id)),aggregate=distributionMetrics(heldOut),benchmark=metrics(pairedBaseline),uncertainty=pairedBootstrap(heldOut,pairedBaseline),last=folds.at(-1);
 const promotionPassed=aggregate.brier<benchmark.brier&&aggregate.logLoss<benchmark.logLoss&&uncertainty.brierDifference95[1]<0&&last.metrics.logLoss<=last.baseline.logLoss;
 const selected=[...variants].sort((a,b)=>loss(a.rows)-loss(b.rows))[0],lastSeason=seasons.at(-1),train=rows.filter(r=>r.season>lastSeason-protocol.trainingSeasonWindow),classifier=fitRegression(train,selected.names,{logistic:true,ridge:selected.ridge}),totalModel=fitRegression(train,totalFeatures,{target:'actualTotal',ridge:10}),calibration=selected.calibrated?fitProbabilityCalibration(selected.rawRows):{intercept:0,slope:1};
 const residualRows=selected.rows.filter(r=>r.season>=lastSeason-2),scale=marginScale(residualRows),totalErrors=residualRows.map(r=>r.actualTotal-r.rawExpectedTotal),totalOffset=average(totalErrors),totalSd=Math.sqrt(average(totalErrors.map(x=>(x-totalOffset)**2))),mErrors=residualRows.map(r=>(r.actualMargin-r.expectedMargin)/Math.max(1,scale)),mMean=average(mErrors),mSd=Math.sqrt(average(mErrors.map(x=>(x-mMean)**2))),rho=clamp(average(mErrors.map((x,i)=>(x-mMean)*(totalErrors[i]-totalOffset)))/(mSd*totalSd),-.6,.6);
 return {protocol,folds,aggregate,baseline:benchmark,uncertainty,promotion:{passed:promotionPassed,gate:protocol.promotionGate,prospectiveValidationPending:true},variants:variants.map(v=>({id:v.id,metrics:metrics(v.rows.filter(r=>r.season>=protocol.outerEvaluationStarts))})),predictions:heldOut,selected:selected.id,liveModel:{classifier,totalModel,calibration,marginScale:scale,totalOffset,totalSd,rho},state:features.state,lastGameAt:features.lastGameAt};
}
