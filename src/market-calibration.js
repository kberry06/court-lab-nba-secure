const clamp=p=>Math.max(.0001,Math.min(.9999,p)),logit=p=>Math.log(clamp(p)/(1-clamp(p))),sigmoid=x=>1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));
export const supportedFamilies=['spread','total','player_points','player_rebounds','player_assists','player_pra','player_pa','player_ra','player_pr'];
export function calibrationMetrics(rows,key='probability'){
 if(!rows.length)return {selections:0,games:0,brier:null,logLoss:null,bins:[]};
 let w=0,b=0,l=0;for(const r of rows){const weight=r.weight??1,p=clamp(r[key]);w+=weight;b+=weight*(p-r.y)**2;l-=weight*(r.y*Math.log(p)+(1-r.y)*Math.log(1-p));}
 return {selections:rows.length,games:new Set(rows.map(r=>r.eventId)).size,brier:b/w,logLoss:l/w,bins:Array.from({length:10},(_,i)=>{const rs=rows.filter(r=>Math.min(9,Math.floor(r[key]*10))===i),sum=rs.reduce((n,r)=>n+(r.weight??1),0);return {lower:i/10,selections:rs.length,predicted:sum?rs.reduce((n,r)=>n+r[key]*(r.weight??1),0)/sum:null,observed:sum?rs.reduce((n,r)=>n+r.y*(r.weight??1),0)/sum:null};})};
}
export function caseWeights(rows){const counts=new Map();for(const r of rows){const key=JSON.stringify([r.eventId,r.playerId||'',r.family]);counts.set(key,(counts.get(key)||0)+1);}return rows.map(r=>({...r,weight:1/counts.get(JSON.stringify([r.eventId,r.playerId||'',r.family]))}));}
export function fitMarketFamily(rows,family,cutoff,{diagnostic=false,minGames=diagnostic?10:100,minSelections=diagnostic?100:500}={}){
 if(!supportedFamilies.includes(family))throw new Error('Unsupported calibration family');const at=Date.parse(cutoff);if(!Number.isFinite(at))throw new Error('Calibration cutoff required');
 const train=caseWeights(rows.filter(r=>r.family===family&&Number.isFinite(r.probability)&&r.probability>=0&&r.probability<=1&&[0,1].includes(r.y)&&Date.parse(r.forecastAt)<at&&Date.parse(r.settledAt)<at&&(diagnostic?r.source==='diagnostic-thresholds':r.source==='prospective-matched-quotes'&&r.eligibleForCalibration===true)));
 const games=new Set(train.map(r=>r.eventId)).size;if(games<minGames||train.length<minSelections)return {family,status:'insufficient evidence',trainedThrough:cutoff,games,selections:train.length,intercept:0,slope:1,eligibleForLive:false};
 let intercept=0,slope=1,total=train.reduce((n,r)=>n+r.weight,0);
 for(let i=0;i<250;i++){let a=0,b=0;for(const r of train){const x=logit(r.probability),error=sigmoid(intercept+slope*x)-r.y;a+=r.weight*error;b+=r.weight*error*x;}intercept-=.08*(a/total+.02*intercept);slope=Math.max(.1,Math.min(3,slope-.08*(b/total+.02*(slope-1))));}
 return {family,status:diagnostic?'diagnostic research fit':'candidate fit; forward validation required',trainedThrough:cutoff,games,selections:train.length,intercept,slope,eligibleForLive:false};
}
export function applyMarketCalibration(p,model){return sigmoid(model.intercept+model.slope*logit(p));}
export function walkForwardFamilyCalibration(rows){
 const results=[];for(const family of supportedFamilies){const familyRows=rows.filter(r=>r.family===family),seasons=[...new Set(familyRows.map(r=>r.season))].sort(),predictions=[],folds=[];
  for(const season of seasons){const test=familyRows.filter(r=>r.season===season),cutoff=test.map(r=>r.forecastAt).sort()[0],train=familyRows.filter(r=>r.season<season),model=fitMarketFamily(train,family,cutoff,{diagnostic:true});if(model.status==='insufficient evidence'){folds.push({season,status:model.status,trainingGames:model.games});continue;}const evaluated=caseWeights(test.map(r=>({...r,calibrated:applyMarketCalibration(r.probability,model)})));predictions.push(...evaluated);folds.push({season,model,raw:calibrationMetrics(evaluated),calibrated:calibrationMetrics(evaluated,'calibrated')});}
  const compact=metric=>metric?{selections:metric.selections,games:metric.games,brier:metric.brier,logLoss:metric.logLoss}:undefined;
  results.push({family,source:'Diagnostic thresholds; not historical bookmaker prices',folds:folds.map(f=>({...f,raw:compact(f.raw),calibrated:compact(f.calibrated)})),raw:calibrationMetrics(predictions),calibrated:calibrationMetrics(predictions,'calibrated'),eligibleForLive:false});
 }return results;
}
