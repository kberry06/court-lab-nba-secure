export const JOINT_MINUTE_VERSION='minute-shadow-rotation-2';
// Dependent rounding preserves marginal probabilities before the five-player
// feasibility rejection, while keeping rotation size within one of its mean.
export function coupledParticipation(probabilities,random){
 if(probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))throw new Error('Invalid participation probability');
 const p=[...probabilities];
 for(;;){const fractional=p.map((v,i)=>v>1e-10&&v<1-1e-10?i:-1).filter(i=>i>=0);if(fractional.length<2)break;
  const i=fractional[Math.floor(random()*fractional.length)],others=fractional.filter(j=>j!==i),j=others[Math.floor(random()*others.length)],up=Math.min(1-p[i],p[j]),down=Math.min(p[i],1-p[j]);
  if(random()<down/(up+down)){p[i]+=up;p[j]-=up;}else{p[i]-=down;p[j]+=down;}
 }
 return p.map(v=>v>=1-1e-10||v>1e-10&&random()<v);
}
// Constrained weighted least squares. More uncertain roles absorb more budget
// adjustment. Bounds are solved together, so every legal draw still sums to 240.
export function weightedMinuteBudget(targets,variances,active=targets.map(()=>true),floor=0){
 if(targets.length!==variances.length||targets.length!==active.length||targets.some(x=>!Number.isFinite(x))||variances.some(x=>!Number.isFinite(x)||x<=0))throw new Error('Finite targets and positive role variances required');
 if(active.filter(Boolean).length<5)throw new Error('Five available players required');
 let left=240,open=targets.map((_,i)=>i).filter(i=>active[i]);const out=targets.map(()=>0),desired=targets.map(x=>Math.max(floor,Math.min(48,x)));
 // Bisection handles simultaneous upper/lower clipping without over-fixing.
 let lo=-10000,hi=10000;for(let n=0;n<55;n++){const lambda=(lo+hi)/2,sum=open.reduce((s,i)=>s+Math.max(floor,Math.min(48,desired[i]+lambda*variances[i])),0);if(sum<left)lo=lambda;else hi=lambda;}
 const lambda=(lo+hi)/2;for(const i of open)out[i]=Math.max(floor,Math.min(48,desired[i]+lambda*variances[i]));return out;
}
export function sampleJointRoleMinutes(players,random,normal){
 let active;
 for(let attempt=0;attempt<128;attempt++){active=coupledParticipation(players.map(p=>p.availability),random);if(active.filter(Boolean).length>=5)break;if(attempt===127)throw new Error('Participation assumptions cannot support a legal rotation');}
 const variances=players.map(p=>(p.minuteSd??6)**2),targets=players.map((p,i)=>active[i]?(p.roleMinutes??p.minutes)+(p.minuteSd??6)*normal(random):0);
 return weightedMinuteBudget(targets,variances,active,.1);
}
