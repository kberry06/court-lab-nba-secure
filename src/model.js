import { validateScenario } from './validation.js';
export const MODEL_VERSION = 'baseline-correlated-0.1';
export function rng(seed=42) { let a=seed>>>0; return () => { a+=0x6D2B79F5; let t=a; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
export function normal(random) { return Math.sqrt(-2*Math.log(Math.max(random(),1e-12)))*Math.cos(2*Math.PI*random()); }
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
function summary(a) { const b=[...a].sort((x,y)=>x-y); return {mean:mean(a),p10:b[Math.floor(b.length*.1)],p50:b[Math.floor(b.length*.5)],p90:b[Math.floor(b.length*.9)]}; }
function minutesFor(players, random) {
  let active=players.map(p=>random()<p.availability);
  // Reject impossible sampled lineups instead of silently activating injured players.
  for(let attempt=0;active.filter(Boolean).length<5;attempt++) { if(attempt>10000) throw new Error('Availability assumptions rarely produce five players; revise lineup'); active=players.map(p=>random()<p.availability); }
  const weights=players.map((p,i)=>active[i]?Math.max(.1,p.minutes*(1+.08*normal(random))):0);
  const mins=weights.map(()=>0); let left=240;
  let open=weights.map((_,i)=>i).filter(i=>active[i]);
  while(open.length && left>1e-8) { const sum=open.reduce((a,i)=>a+weights[i],0); const capped=open.filter(i=>left*weights[i]/sum>=48); if(!capped.length) { for(const i of open) mins[i]=left*weights[i]/sum; break; } for(const i of capped){mins[i]=48;left-=48;} open=open.filter(i=>!capped.includes(i)); }
  return mins;
}
export function simulate(scenario, {seed=42,draws=10000}={}) {
  validateScenario(scenario); if(draws!==10000) throw new Error('Production simulations require 10,000 draws');
  const random=rng(seed), teams=scenario.teams, scores=[[],[]], minutes=[[],[]];
  const playerSamples=Object.fromEntries(teams.flatMap(t=>t.players.map(p=>[p.id,{points:[],rebounds:[],assists:[],minutes:[],active:[]}])));
  for(let d=0;d<draws;d++) {
    const pace=(teams[0].pace+teams[1].pace)/2 + 3.5*normal(random), shared=normal(random);
    const ms=teams.map(t=>minutesFor(t.players,random));
    const teamShock=[normal(random),normal(random)];
    for(let side=0;side<2;side++) {
      const t=teams[side],opp=teams[1-side];
      const lost=t.players.reduce((n,p,i)=>n+p.impact*(ms[side][i]-p.minutes)/36,0);
      const rating=t.offense+opp.defense-114+(side===0?1.5:-1.5)+(t.restDays===0?-1.5:0)+lost;
      scores[side].push(Math.max(60,Math.round(pace*rating/100+7*teamShock[side]+3*shared)));
    }
    // Overtime: resolve ties, preserving a non-draw full-game moneyline.
    let ot=0;
    while(scores[0][d]===scores[1][d]) { ot++; for(let side=0;side<2;side++) scores[side][d]+=Math.max(1,Math.round(11+3*normal(random))); }
    for(let side=0;side<2;side++) {
      const t=teams[side]; const weights=t.players.map((p,i)=>ms[side][i]*p.points*Math.exp(.25*normal(random)));
      const total=weights.reduce((a,b)=>a+b,0)||1;
      const exact=weights.map(w=>w/total*scores[side][d]); const pts=exact.map(Math.floor);
      const order=exact.map((v,i)=>({i,f:v-pts[i]})).sort((a,b)=>b.f-a.f);
      const remaining=scores[side][d]-pts.reduce((a,b)=>a+b,0);
      for(let k=0;k<remaining;k++) pts[order[k%order.length].i]++;
      for(let i=0;i<t.players.length;i++) { const p=t.players[i],out=playerSamples[p.id],m=ms[side][i]*(1+ot*5/48); out.minutes.push(m);out.active.push(ms[side][i]>0);out.points.push(pts[i]);
        const involvement=normal(random);
        for(const stat of ['rebounds','assists']) out[stat].push(m===0?0:Math.max(0,Math.round(m*p[stat]*(pace/100)*Math.exp(.14*shared+.16*involvement+.2*normal(random)-.0426))));
      }
      minutes[side].push(ms[side].reduce((a,b)=>a+b,0));
    }
  }
  const margin=scores[0].map((h,i)=>h-scores[1][i]),total=scores[0].map((h,i)=>h+scores[1][i]);
  const p=margin.filter(m=>m>0).length/draws;
  return {modelVersion:MODEL_VERSION,seed,draws,generatedAt:new Date().toISOString(),asOf:scenario.asOf,demo:scenario.demo,eventId:scenario.id,homeWin:p,mc95HalfWidth:1.96*Math.sqrt(p*(1-p)/draws),home:summary(scores[0]),away:summary(scores[1]),margin:summary(margin),total:summary(total),players:teams.flatMap(t=>t.players.map(p=>({id:p.id,name:p.name,teamId:t.id,...Object.fromEntries(['points','rebounds','assists','minutes'].map(k=>[k,summary(playerSamples[p.id][k])]))}))),samples:{scores,margin,total,players:playerSamples,minutes}};
}
