const defaults={points:.45,rebounds:.15,assists:.10};
export function baselinePlayerEstimate(history){
 const rows=history.slice(0,20),total=rows.reduce((n,r)=>n+r.minutes,0),prior=rows.length<3?120:0;
 return {minutes:rows.length?rows.reduce((n,r)=>n+r.minutes,0)/rows.length:6,...Object.fromEntries(Object.entries(defaults).map(([key,p])=>[key,(rows.reduce((n,r)=>n+r[key],0)+p*prior)/(total+prior)]))};
}
export function estimatePlayer(history,{halfLife=6,priorMinutes=60,leaguePriors=defaults}={}){
 const rows=history.slice(0,20),longMinutes=rows.reduce((n,r)=>n+r.minutes,0),coldPrior=120;
 const longRates=Object.fromEntries(Object.entries(leaguePriors).map(([k,p])=>[k,(rows.reduce((n,r)=>n+r[k],0)+p*coldPrior)/(longMinutes+coldPrior)]));
 if(!rows.length)return {minutes:6,...longRates};
 let weight=0,minutes=0;const sums={points:0,rebounds:0,assists:0};
 for(const [i,r] of rows.slice(0,20).entries()){const w=2**(-i/halfLife);weight+=w;minutes+=w*r.minutes;for(const k of Object.keys(sums))sums[k]+=w*r[k];}
 return {minutes:minutes/weight,...Object.fromEntries(Object.keys(sums).map(k=>[k,(sums[k]+priorMinutes*longRates[k])/(minutes+priorMinutes)]))};
}
