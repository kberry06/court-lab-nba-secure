// Research model: resample complete prior team rotations, preserving observed
// participation/minute dependence. No target-game lineup or outcome is used.
export function sampleJointMinutes(players,history,random){
 if(!history?.length||random()<.05)return null; // Fixed support mixture for eligible players absent from recent templates.
 const weights=history.map((_,i)=>2**(-i/6)),sum=weights.reduce((a,b)=>a+b,0);
 for(let attempt=0;attempt<32;attempt++){
  let draw=random()*sum,index=0;while(index<weights.length-1&&draw>=weights[index])draw-=weights[index++];
  const template=history[index],mins=players.map(p=>random()<p.availability?Math.max(0,Math.min(48,Number(template.minutes[p.id]||0))):0);
  if(mins.filter(m=>m>0).length<5)continue;
  let left=240,open=mins.map((_,i)=>i).filter(i=>mins[i]>0);const out=mins.map(()=>0);
  while(open.length){const total=open.reduce((n,i)=>n+mins[i],0),capped=open.filter(i=>left*mins[i]/total>=48);if(!capped.length){for(const i of open)out[i]=left*mins[i]/total;break;}for(const i of capped){out[i]=48;left-=48;}open=open.filter(i=>!capped.includes(i));}
  return out;
 }
 return null;
}
