// Research challenger. Training uses earlier seasons only; this is not live calibration.
export const COUNT_VERSION='player-count-shadow-1';
export const countStats=['points','rebounds','assists'];
export function cholesky(matrix){
 const out=matrix.map(()=>[0,0,0]);
 for(let i=0;i<3;i++)for(let j=0;j<=i;j++){let value=matrix[i][j];for(let k=0;k<j;k++)value-=out[i][k]*out[j][k];if(i===j){if(value<=0||!Number.isFinite(value))throw new Error('Non-positive count covariance');out[i][j]=Math.sqrt(value);}else out[i][j]=value/out[j][j];}
 return out;
}
export function fitCountModel(rows,{trainingLastSettledAt}={}){
 const valid=rows.filter(r=>r.minutes>=5&&countStats.every(k=>Number.isFinite(r.actual[k])&&r.actual[k]>=0&&Number.isFinite(r.mean[k])&&r.mean[k]>0));
 if(valid.length<500||!Number.isFinite(Date.parse(trainingLastSettledAt)))throw new Error('Insufficient earlier-season rate evidence');
 const raw=countStats.map((a,i)=>countStats.map((b,j)=>{
  let numerator=0,denominator=0;for(const r of valid){numerator+=(r.actual[a]-r.mean[a])*(r.actual[b]-r.mean[b])-(i===j?r.mean[a]:0);denominator+=r.mean[a]*r.mean[b];}
  return i===j?Math.max(.0001,numerator/denominator):numerator/denominator;
 }));
 const covariance=raw.map((row,i)=>row.map((v,j)=>i===j?Math.log1p(v):Math.log1p(Math.max(-.95,v))));
 let offDiagonalScale=1,lower;for(let attempt=0;attempt<20;attempt++){const adjusted=covariance.map((row,i)=>row.map((v,j)=>i===j?v:v*offDiagonalScale));try{lower=cholesky(adjusted);break;}catch{offDiagonalScale*=.5;}}
 if(!lower)throw new Error('Count covariance could not be regularized');
 return {version:COUNT_VERSION,shadowOnly:true,trainingLastSettledAt,cases:valid.length,rawOverdispersion:raw,offDiagonalScale,lower,rateCorrection:Object.fromEntries(countStats.map(k=>[k,valid.reduce((s,r)=>s+r.actual[k],0)/valid.reduce((s,r)=>s+r.mean[k],0)]))};
}
export function validateCountModel(artifact,asOf){
 if(artifact?.version!==COUNT_VERSION||artifact.shadowOnly!==true||!Number.isFinite(Date.parse(asOf))||!(Date.parse(artifact.trainingLastSettledAt)+86400000<Date.parse(asOf))||artifact.cases<500)throw new Error('Count training must predate the forecast with a 24-hour embargo');
 const lower=artifact.lower;if(!Array.isArray(lower)||lower.length!==3||lower.some((row,i)=>!Array.isArray(row)||row.length!==3||row.some((v,j)=>!Number.isFinite(v)||j>i&&v!==0)||row[i]<=0||row[i]>3)||countStats.some(k=>!Number.isFinite(artifact.rateCorrection?.[k])||artifact.rateCorrection[k]<=0||artifact.rateCorrection[k]>3))throw new Error('Invalid learned count parameters');
 return artifact;
}
// Exact Poisson draws; splitting avoids exponential underflow at large means.
export function poisson(mean,random){
 if(!Number.isFinite(mean)||mean<0||mean>1e5)throw new Error('Invalid count mean');
 let result=0;while(mean>0){const part=Math.min(20,mean),threshold=Math.exp(-part);let product=1,n=0;do{product*=Math.max(1e-15,random());n++;}while(product>threshold);result+=n-1;mean-=part;}return result;
}
export function scoreAllocation(score,weights,random){
 if(!Number.isInteger(score)||score<0||!weights.length||weights.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid score allocation');
 const sum=weights.reduce((a,b)=>a+b,0);if(sum<=0)throw new Error('No active scoring mass');
 const out=weights.map(()=>0),cdf=[];weights.reduce((a,w,i)=>(cdf[i]=a+w),0);
 for(let n=0;n<score;n++){const draw=random()*sum;let i=0;while(i<cdf.length-1&&draw>=cdf[i])i++;out[i]++;}return out;
}
export function rateShocks(lower,random,normal){
 const z=[normal(random),normal(random),normal(random)];return lower.map((row,i)=>Math.exp(row.reduce((s,v,j)=>s+v*z[j],0)-row.reduce((s,v)=>s+v*v,0)/2));
}
