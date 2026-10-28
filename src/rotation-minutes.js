// Project conditional role targets onto a legal team minute budget. Unlike
// proportional scaling, equal absolute corrections preserve role differences.
export const ROLE_MODEL_VERSION='trained-opponent-rest-role-budget-1';
export function roleMinuteBudget(targets,active=targets.map(()=>true)){
 if(targets.length!==active.length||targets.some(x=>!Number.isFinite(x)))throw new Error('Finite role targets required');
 let open=targets.map((_,i)=>i).filter(i=>active[i]);if(open.length<5)throw new Error('Five available players required');
 const desired=targets.map(x=>Math.max(0,Math.min(48,x))),out=targets.map(()=>0);let left=240;
 while(open.length){const shift=(open.reduce((n,i)=>n+desired[i],0)-left)/open.length,clipped=open.filter(i=>desired[i]-shift<0||desired[i]-shift>48);
  if(!clipped.length){for(const i of open)out[i]=desired[i]-shift;break;}
  for(const i of clipped){out[i]=desired[i]-shift<0?0:48;left-=out[i];}const fixed=new Set(clipped);open=open.filter(i=>!fixed.has(i));
 }
 return out;
}
export function roleMinuteSd(rows){if(rows.length<3)return 6;const mean=rows.reduce((n,r)=>n+r.minutes,0)/rows.length,variance=rows.reduce((n,r)=>n+(r.minutes-mean)**2,0)/(rows.length-1);return Math.max(4,Math.min(12,Math.sqrt((variance*rows.length+36*5)/(rows.length+5))));}
