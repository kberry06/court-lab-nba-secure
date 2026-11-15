import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleFinal,LIVE_INPUT_VERSION,LIVE_MODEL_VERSION,LIVE_BASELINE_VERSION,LIVE_JOINT_VERSION} from '../src/live-finals.js';
import {publicNba} from '../src/public-nba.js';
import {buildScenario} from '../src/nba-data.js';
import {buildJointMinuteShadow} from '../src/minute-shadow.js';
import {minuteFeatures} from '../src/minute-features.js';
import {compactInputSnapshot} from '../src/input-snapshots.js';
import {simulate} from '../src/model.js';
import {forecastCollector} from '../src/forecast-collector.js';
import {playerWorkload} from '../src/fatigue.js';
import {minuteSeries,minuteOverlay} from '../public/performance.js';
import {buildGameForecast} from '../src/trained-forecast.js';

const now=Date.parse('2026-11-15T12:00:00Z'),hour=3600000;
function fixture(){
 const teams=[{id:1,full_name:'Home'},{id:2,full_name:'Away'}],event=(id,time,final=true)=>({id:String(id),date:new Date(time).toISOString(),season:{year:2027},competitions:[{type:{id:'1'},status:{type:final?{completed:true}:{name:'STATUS_SCHEDULED'}},competitors:teams.map((t,i)=>({homeAway:i?'away':'home',team:{id:String(t.id),displayName:t.full_name},score:i?'114':'120'}))}]}),events=[...Array.from({length:5},(_,i)=>event(i+1,now-(i+3)*86400000)),event(99,now-6*hour)],next=event(100,now+18*hour,false);
 const summary=e=>({header:e,boxscore:{players:teams.map(t=>({team:{id:String(t.id)},statistics:[{labels:['MIN','PTS','REB','AST'],athletes:Array.from({length:6},(_,i)=>({athlete:{id:String(t.id*100+i)},starter:i<5,stats:[String(e.id==='99'?i?39.6:42:40),String(t.id===1?20:19),'6','4']}))}]}))}});
 const cache=new Map(),store={cache:k=>cache.get(k),saveCache:(k,body)=>cache.set(k,{body,savedAt:now})};
 const fetcher=async url=>{const u=new URL(url),path=u.pathname;let body;
  if(path.endsWith('/roster')){const id=Number(path.split('/').at(-2));body={athletes:Array.from({length:6},(_,i)=>({id:String(id*100+i),firstName:'Player',lastName:String(id*100+i)}))};}
  else if(path.endsWith('/schedule'))body={events};
  else if(path.endsWith('/summary'))body=summary(events.find(e=>e.id===u.searchParams.get('event')));
  else if(path.endsWith('/gamelog'))body={seasonTypes:[]};
  else throw Error('Unexpected test URL');
  return {ok:true,json:async()=>body};};
 return {teams,events,next,summary,store,fetcher,client:publicNba(store,{clock:()=>now,fetcher})};
}

test('fresh forecast includes a six-hour-old reconciled final in game, role, rates, workload and archived inputs',async()=>{
 const f=fixture(),{normalizeEvent}=await import('../src/public-nba.js'),b=await f.client.matchup(normalizeEvent(f.next));
 assert.equal(b.liveInputVersion,LIVE_INPUT_VERSION);assert.equal(eligibleFinal(b,b.games.find(g=>g.id===99)),true);
 const s=buildScenario(b,100,now),p=s.teams[0].players.find(p=>p.id==='espn:player:100');
 assert.equal(p.recent[0].gameId,99);assert.equal(p.recent[0].minutes,42);assert.equal(p.recentRoles[0].gameId,99);assert.equal(p.fatigue.backToBack,true);assert.equal(p.fatigue.hoursBetweenTips,24);assert.equal(s.teams[0].restDays,0);assert.equal(s.gameForecast.features.backToBack,0);
 const changed={...b,games:b.games.map(g=>g.id===99?{...g,visitor_team:{id:3,full_name:'Third team'}}:g)};
 const restedOpponent=buildGameForecast(changed,changed.games.find(g=>g.id===100));assert.equal(restedOpponent.features.backToBack,-1);assert.notEqual(restedOpponent.probability,s.gameForecast.probability);
 const snapshot=compactInputSnapshot(b,100,now);assert.ok(snapshot.payload.priorRoles.some(r=>r.gameId===99));assert.ok(snapshot.payload.verifiedFinals[99]);
 const result=simulate(s);assert.ok([LIVE_MODEL_VERSION,LIVE_BASELINE_VERSION].includes(result.modelVersion));
 const shadow=buildJointMinuteShadow(b,s);assert.equal(shadow.rotationMode,LIVE_JOINT_VERSION);assert.equal(simulate(shadow).modelVersion,LIVE_JOINT_VERSION);
 for(const team of result.samples.minutes)assert.ok(team.every(n=>Math.abs(n-240)<1e-7));
 const old={...b,liveInputVersion:undefined};assert.equal(eligibleFinal(old,b.games.find(g=>g.id===99)),false);assert.notEqual(buildScenario(old,100,now).teams[0].players[0].recent[0].gameId,99);
 const tooLate={...b,verifiedFinals:{99:{...b.verifiedFinals[99],receivedAt:new Date(now+1).toISOString()}}};assert.equal(eligibleFinal(tooLate,b.games.find(g=>g.id===99)),false);
 assert.equal(eligibleFinal(b,{...b.games.find(g=>g.id===99),status_state:'in_progress'}),false);
});
test('an incomplete latest final blocks preparation instead of silently omitting last night',async()=>{
 const f=fixture(),client=publicNba(f.store,{clock:()=>now,fetcher:async url=>{const r=await f.fetcher(url);if(url.includes('summary?event=99')){const body=await r.json();body.boxscore.players[0].statistics[0].athletes.pop();return {ok:true,json:async()=>body};}return r;}}),{normalizeEvent}=await import('../src/public-nba.js');
 await assert.rejects(client.matchup(normalizeEvent(f.next)),/reconcile/);
});
test('recent minute features require an explicitly verified earlier receipt; historical embargo stays default',()=>{
 const r={datetime:new Date(now-6*hour).toISOString(),minutes:40,verifiedFinalAt:new Date(now-hour).toISOString()};
 assert.throws(()=>minuteFeatures([r],[r],new Date(now).toISOString()),/embargo/);
 assert.equal(minuteFeatures([r],[r],new Date(now).toISOString(),{allowVerifiedRecentFinals:true}).last,40/48);
 assert.throws(()=>minuteFeatures([{...r,verifiedFinalAt:new Date(now+1).toISOString()}],[],new Date(now).toISOString(),{allowVerifiedRecentFinals:true}),/embargo/);
});
test('a newly final game invalidates a saved early capture for the same teams, without rewriting it',async()=>{
 const cache=new Map(),calls=[],games=[{id:100,datetime:new Date(now+10*hour).toISOString(),status_state:'scheduled',home_team:{id:1},visitor_team:{id:2}}],collector=forecastCollector({clock:()=>now,nba:{schedule:async()=>({games})},store:{cache:k=>cache.has(k)?{body:cache.get(k)}:null,saveCache:(k,body)=>cache.set(k,body),settleGames:()=>{},pendingPerformanceEvents:()=>[],pendingMatchedEvents:()=>[],shadowCapturedEvents:()=>[]},prepare:async g=>{calls.push(g.id);return {shadow:{state:'saved'}};}});
 await collector.tick();await collector.tick();assert.equal(calls.length,1);
 games.push({id:99,datetime:new Date(now-6*hour).toISOString(),status_state:'final',home_team:{id:1},visitor_team:{id:3}});
 await collector.tick();assert.equal(calls.length,2);await collector.tick();assert.equal(calls.length,2);
});
test('workload is causal and widens back-to-back uncertainty only with own prior comparable games',()=>{
 const rows=[20,40,20,40,20,40].map((minutes,i)=>({minutes,datetime:new Date(now-i*24*hour).toISOString()})),fatigue=playerWorkload(rows,new Date(now+24*hour).toISOString(),4);
 assert.equal(fatigue.backToBack,true);assert.equal(fatigue.minutesLast72Hours,80);assert.ok(fatigue.minuteSd>4);
 assert.equal(playerWorkload(rows,new Date(now+60*hour).toISOString(),4).minuteSd,4);
 assert.equal(playerWorkload([{minutes:48,datetime:new Date(now+36*hour).toISOString()},...rows],new Date(now+24*hour).toISOString(),4).lastGameMinutes,20);
});
test('minutes overlay uses an independent right scale, preserves overtime and leaves missing minutes blank',()=>{
 assert.deepEqual(minuteSeries([{minutes:35},{minutes:null},{minutes:53}]),{values:[35,null,53],ceiling:60});
 const svg=minuteOverlay([{minutes:35},{minutes:null},{minutes:53}],{x:i=>i*50,top:25,bottom:64,height:300,width:720,right:65});
 assert.match(svg,/right axis/);assert.match(svg,/Minutes played: 53.0/);assert.doesNotMatch(svg,/<line /);assert.doesNotMatch(svg,/NaN/);
});
