export function minuteAcceptance(audits,{target=4.5}={}){
 const blockers=[];if(!Array.isArray(audits)||!audits.length)blockers.push('Final allocation audit missing');
 for(const a of audits||[]){const label=a.pool||'pool';if(a.games<60||a.incumbent.players<1000)blockers.push(label+': insufficient paired coverage');if(a.incumbent.players!==a.candidate.players||a.cohortMismatch)blockers.push(label+': player cohorts differ');if(!Number.isFinite(a.candidate.mae.minutes)||a.candidate.mae.minutes>target)blockers.push(label+': minute MAE exceeds '+target);if(!Number.isFinite(a.candidate.mae.points)||a.candidate.mae.points>a.incumbent.mae.points)blockers.push(label+': point MAE worsens');}
 return {passed:blockers.length===0,targetMinuteMAE:target,blockers,prospectiveValidationPending:true,scope:'Paired historical final allocations; not bookmaker calibration or live accuracy proof'};
}
