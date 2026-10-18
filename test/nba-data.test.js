import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvent,normalizeRoster,normalizeBox,publicNba} from '../src/public-nba.js';
import {buildScenario} from '../src/nba-data.js';
const now=Date.parse('2026-10-18T10:00:00Z');
const teams=[{id:1,full_name:'Home'},{id:2,full_name:'Away'}];
function bundle(){
 const games=Array.from({length:6},(_,i)=>({id:i+1,date:`2026-10-${10+i}`,datetime:`2026-10-${10+i}T00:00:00Z`,status_state:'final',home_team:teams[0],visitor_team:teams[1],home_team_score:110+i,visitor_team_score:105+i}));
 const future={...games[0],id:100,date:'2026-10-20',datetime:'2026-10-20T00:00:00Z',status_state:'scheduled'};
 const players=teams.flatMap(t=>Array.from({length:8},(_,i)=>({id:t.id*100+i,first_name:'Player',last_name:String(t.id*100+i),team:t,position:'G'})));
 return {provider:'espn',rightsBasis:'test fixture',fetchedAt:new Date(now).toISOString(),games:[...games,future],players,injuries:[],stats:games.flatMap(g=>players.map(p=>({player:{id:p.id},game:{id:g.id,date:g.date},min:'30:00',pts:15,reb:6,ast:3})))};
}
test('real-data projection uses pre-cutoff completed history and durable IDs',()=>{const b=bundle();const s=buildScenario(b,100,now);assert.equal(s.id,'espn:game:100');assert.equal(s.demo,false);assert.equal(s.teams[0].players[0].points,.5);const before=s.teams[0].offense;b.games.push({...b.games[0],id:999,datetime:'2026-10-19T00:00:00Z',home_team_score:200});assert.equal(buildScenario(b,100,now).teams[0].offense,before);});
test('injuries change availability; missing or stale inputs fail visibly',()=>{const b=bundle();b.injuries=[{player:{id:100},status:'Out'}];assert.equal(buildScenario(b,100,now).teams[0].players.find(p=>p.id==='espn:player:100').availability,0);assert.throws(()=>buildScenario({...b,players:[]},100,now),/roster/);assert.throws(()=>buildScenario({...b,fetchedAt:'2026-10-10T00:00:00Z'},100,now),/Refresh/);});
test('ESPN event normalizes explicit home/away and time uncertainty',()=>{const e={id:'3',date:'2026-10-20T00:00Z',season:{year:2027},competitions:[{timeValid:true,status:{type:{name:'STATUS_SCHEDULED',state:'pre'}},competitors:[{homeAway:'away',team:{id:'2',displayName:'Away'},score:'0'},{homeAway:'home',team:{id:'1',displayName:'Home'},score:{value:0}}]}]};assert.equal(normalizeEvent(e).home_team.id,1);assert.equal(normalizeEvent(e).status_state,'scheduled');e.competitions[0].timeValid=false;assert.equal(normalizeEvent(e).datetime,null);});
test('box-score labels are mapped by name rather than assumed position',()=>{const rows=normalizeBox({boxscore:{players:[{team:{id:'1'},statistics:[{labels:['PTS','AST','MIN','REB'],athletes:[{athlete:{id:'100'},stats:['17','4','31','8']},{athlete:{id:'101'},didNotPlay:true}]}]}]}},{id:3,date:'2026-10-10'});assert.equal(rows[0].pts,17);assert.equal(rows[0].min,'31');assert.equal(rows.length,1);assert.equal(normalizeRoster({athletes:[{id:'100',firstName:'A',lastName:'B',injuries:[{status:'Out'}]}]},teams[0]).injuries[0].status,'Out');});
test('public source access errors retain cached data and do not retry or bypass',async()=>{const saved=[];const client=publicNba({cache:()=>null,saveCache:(...v)=>saved.push(v)},{clock:()=>now,fetcher:async()=>({ok:false,status:403})});await assert.rejects(client.schedule(),/403/);assert.equal(saved.length,0);});
