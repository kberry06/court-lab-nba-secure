const sigmoid=x=>1/(1+Math.exp(-x));
// KL projection of appearance priors onto the expected regulation-minute budget.
// Input role targets and priors are pregame estimates, never target outcomes.
export function balanceParticipation(targets,priors,budget=240){
 if(targets.length!==priors.length||targets.some(m=>!Number.isFinite(m)||m<0||m>48)||priors.some(p=>!Number.isFinite(p)||p<0||p>1))throw new Error('Finite role targets and appearance priors required');
 const mass=targets.reduce((n,m,i)=>n+(priors[i]===0?0:m),0),feasible=mass>=budget;
 if(mass<=budget)return {probabilities:priors.map(p=>p===0?0:1),expectedMinutes:mass,feasible};
 const logits=priors.map(p=>Math.log(Math.max(1e-6,Math.min(1-1e-6,p))/(1-Math.max(1e-6,Math.min(1-1e-6,p))))),probs=lambda=>priors.map((p,i)=>p===0?0:sigmoid(logits[i]+lambda*targets[i]/48));let lo=-100,hi=100;
 for(let n=0;n<70;n++){const mid=(lo+hi)/2,p=probs(mid),sum=p.reduce((n,v,i)=>n+v*targets[i],0);if(sum<budget)lo=mid;else hi=mid;}
 const probabilities=probs((lo+hi)/2);return {probabilities,expectedMinutes:probabilities.reduce((n,p,i)=>n+p*targets[i],0),feasible};
}
