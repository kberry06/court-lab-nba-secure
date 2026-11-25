import test from 'node:test';
import assert from 'node:assert/strict';
import {mostProbableSelections} from '../public/top-selections.js';
import {selectionSlate,sydneyDate} from '../src/top-selections.js';
import {createApp} from '../src/server.js';
import {hashPassword} from '../src/auth.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export function shortlistFixture(now=Date.parse('2026-11-21T12:00:00Z')){
 const teams=[1,2].map(id=>({id:'espn:team:'+id,name:id===1?'Home Team':'Away Team',players:Array.from({length:6},(_,i)=>({id:'espn:player:'+(id*100+i),name:['Alex Guard','Blake Forward','Casey Centre'][i%3]+' '+id,availability:1,recent:Array.from({length:5},()=>({points:20,rebounds:7,assists:5}))}))}));
 const scenario={availabilityEvidence:{policy:'official-injury-review-1',state:'verified',publishedAt:new Date(now-60000).toISOString(),receivedAt:new Date(now-60000).toISOString(),rosterReceivedAt:Object.fromEntries(teams.map(t=>[t.id,new Date(now-60000).toISOString()]))},id:'espn:game:100',demo:false,asOf:new Date(now-3600000).toISOString(),start:new Date(now+8*3600000).toISOString(),teams};
 const result={eventId:scenario.id,asOf:scenario.asOf,propSummaryVersion:2,generatedAt:new Date(now-60000).toISOString(),modelVersion:'test-latest',total:{mean:225},margin:{mean:5},players:scenario.teams.flatMap(t=>t.players.map(p=>({id:p.id,conditional:{points:{mean:20},rebounds:{mean:7},assists:{mean:5}}})))};
 const quote=(market,selection,line,p,playerId=null,providerMarket={total:'totals',spread:'spreads'}[market]||market)=>({source:'the-odds-api',ingestMethod:'approved-provider',sourceEventId:'provider-100',eventId:scenario.id,bookmaker:'sportsbet',snapshotId:'latest',observedAt:new Date(now-60000).toISOString(),receivedAt:new Date(now-50000).toISOString(),market,providerMarket,selection,line,price:1.9,modelProbability:p,expectedReturn:p*1.9-1,fairOdds:1/p,distributionValidated:false,eligible:true,period:'full_game',includesOvertime:true,...(playerId?{playerId,dnpRule:'void'}:{})});
 const quotes=[quote('total','over',220.5,.65),quote('total','under',220.5,.35),quote('spread','home',-3.5,.63),quote('spread','away',3.5,.37),quote('player_points','over',18.5,.78,'espn:player:100'),quote('player_points','under',18.5,.22,'espn:player:100'),quote('player_rebounds','over',6.5,.71,'espn:player:101'),quote('player_assists','over',4.5,.67,'espn:player:102')];
 return {scenario,result,quotes,quote,now};
}
test('top four main-line selections rank by probability, preserve Low prop confidence and exclude opposite sides',()=>{
 const f=shortlistFixture(),r=mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now});
 assert.deepEqual(r.selections.map(q=>q.modelProbability),[.78,.71,.67,.65]);assert.equal(r.available,5);
 assert.ok(r.selections.filter(q=>q.playerId).every(q=>q.confidence==='Low'));assert.equal(r.selections[0].projection,20);
 const total=mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now,marketFamily:'total'});assert.equal(total.selections.length,1);assert.equal(total.selections[0].selection,'over');
 const handicap=mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now,marketFamily:'spread'});assert.equal(handicap.selections[0].line,-3.5);assert.equal(handicap.selections[0].name,'Home Team');assert.equal(handicap.selections[0].variance,1.5);
 f.quotes[4].price=1.1;f.quotes[4].expectedReturn=-.142;assert.equal(mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now}).selections[0].expectedReturn,-.142);
});
test('alternates, moneylines, manual/unknown main lines, stale/started/demo inputs and unmapped players never fill the shortlist',()=>{
 const f=shortlistFixture(),invalid=[f.quote('player_points','over',9.5,.99,'espn:player:100','player_points_alternate'),f.quote('moneyline','home',0,.99,null,'h2h'),{...f.quotes[0],source:'manual'}, {...f.quotes[0],providerMarket:'unknown'}, {...f.quotes[0],observedAt:new Date(f.now-16*60000).toISOString()},f.quote('player_points','over',9.5,.99,'espn:player:999')];
 assert.equal(mostProbableSelections(invalid,f.result,f.scenario,{now:f.now}).selections.length,0);
 assert.equal(mostProbableSelections(f.quotes,f.result,{...f.scenario,demo:true},{now:f.now}).selections.length,0);
 assert.equal(mostProbableSelections(f.quotes,f.result,f.scenario,{now:Date.parse(f.scenario.start)}).selections.length,0);
 assert.equal(mostProbableSelections(f.quotes,f.result,{...f.scenario,asOf:new Date(f.now-25*3600000).toISOString()},{now:f.now}).selections.length,0);
});
test('one highest-probability prop per player fills the shortlist with other players and game markets',()=>{
 const f=shortlistFixture();f.quotes.push(f.quote('player_pa','under',30.5,.82,'espn:player:100','player_points_assists'),f.quote('player_pra','under',35.5,.81,'espn:player:100','player_points_rebounds_assists'),f.quote('player_pr','under',30.5,.80,'espn:player:100','player_points_rebounds'));
 const before=structuredClone(f.quotes),r=mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now});
 assert.deepEqual(r.selections.map(q=>q.modelProbability),[.82,.71,.67,.65]);assert.equal(r.available,5);
 const featured=r.selections[0];assert.equal(featured.market,'player_pa');assert.deepEqual(featured.relatedProps.map(q=>q.modelProbability),[.81,.80,.78]);assert.ok(featured.relatedProps.every(q=>q.playerId===featured.playerId&&q.confidence==='Low'));
 assert.equal(new Set(r.selections.filter(q=>q.playerId).map(q=>q.playerId)).size,3);assert.deepEqual(f.quotes,before);
 // Identical display names must not collapse distinct durable player IDs.
 f.scenario.teams[0].players[1].name=f.scenario.teams[0].players[0].name;assert.equal(mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now}).selections.length,4);
});
test('related props never pad a shortfall or reintroduce stale and alternate lines',()=>{
 const f=shortlistFixture();f.quotes=f.quotes.filter(q=>!q.playerId||q.playerId==='espn:player:100');f.quotes.push(f.quote('player_pa','under',30.5,.82,'espn:player:100','player_points_assists'),f.quote('player_pra','under',35.5,.99,'espn:player:100','player_points_rebounds_assists_alternate'),{...f.quote('player_rebounds','under',8.5,.95,'espn:player:100'),observedAt:new Date(f.now-20*60000).toISOString()});
 const r=mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now});assert.equal(r.selections.length,3);assert.equal(r.available,3);assert.match(r.reason,/one prop per player/);assert.equal(r.selections[0].relatedProps.length,1);assert.equal(r.selections[0].relatedProps[0].market,'player_points');
 const props=mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now,marketFamily:'props'});assert.equal(props.selections.length,1);assert.equal(props.selections[0].relatedProps.length,1);
});
test('latest main wins over an older easier line; newer unpriced or ambiguous main quotes cannot fall back to old picks',()=>{
 const f=shortlistFixture(),old={...f.quotes[0],line:200.5,modelProbability:.99,observedAt:new Date(f.now-120000).toISOString(),snapshotId:'old'};
 const current=mostProbableSelections([old,...f.quotes],f.result,f.scenario,{now:f.now,marketFamily:'total'});assert.equal(current.selections[0].line,220.5);
 const newer={...f.quotes[0],line:225.5,observedAt:new Date(f.now-10000).toISOString(),snapshotId:'new'};
 assert.equal(mostProbableSelections([old,...f.quotes],f.result,f.scenario,{now:f.now,marketFamily:'total',currentQuotes:[newer,...f.quotes]}).selections.length,0);
 assert.equal(mostProbableSelections([...f.quotes,{...f.quotes[0],line:225.5}],f.result,f.scenario,{now:f.now,marketFamily:'total'}).selections.length,0);
});
test('shortfall is explicit, and uncertain availability or a material projection discrepancy is excluded',()=>{
 const f=shortlistFixture();f.scenario.teams[0].players[0].availability=.5;f.result.players[1].conditional.rebounds.mean=20;
 const r=mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now});assert.equal(r.selections.length,3);assert.match(r.reason,/Fewer than four/);assert.ok(!r.selections.some(q=>['espn:player:100','espn:player:101'].includes(q.playerId)));
 const low=f.quotes.map(q=>({...q,modelProbability:.49}));assert.equal(mostProbableSelections(low,f.result,f.scenario,{now:f.now}).selections.length,0);
});
test('legacy, stale or unresolved injury evidence holds the whole shortlist, including teammate and game markets',()=>{const f=shortlistFixture();assert.equal(mostProbableSelections(f.quotes,f.result,{...f.scenario,availabilityEvidence:null},{now:f.now}).selections.length,0);const near={...f.scenario,start:new Date(f.now+3600000).toISOString(),availabilityEvidence:{...f.scenario.availabilityEvidence,receivedAt:new Date(f.now-11*60000).toISOString()}};assert.equal(mostProbableSelections(f.quotes,f.result,near,{now:f.now}).selections.length,0);f.scenario.teams[1].players[4].roleMinutes=30;f.scenario.teams[1].players[4].availability=.5;const held=mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now});assert.equal(held.selections.length,0);assert.match(held.reason,/rotation availability/);});
test('uncalibrated ninety-percent estimates stay in research quotes and cannot enter the shortlist',()=>{const f=shortlistFixture();f.quotes[4].modelProbability=.05;f.quotes[5].modelProbability=.95;const before=JSON.stringify(f.quotes),held=mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now});assert.ok(!held.selections.some(q=>q.playerId==='espn:player:100'));assert.equal(JSON.stringify(f.quotes),before);f.quotes[5].distributionValidated=true;assert.equal(mostProbableSelections(f.quotes,f.result,f.scenario,{now:f.now}).selections[0].modelProbability,.95);});
test('Sydney date groups cross the UTC date boundary and schedule status closes finished events',()=>{
 const f=shortlistFixture(),game={id:100,datetime:f.scenario.start,status_state:'scheduled',home_team:{full_name:'Home Team'},visitor_team:{full_name:'Away Team'}},store={cache:()=>({body:{fetchedAt:f.scenario.asOf,games:[game]}}),latestRun:()=>({scenario:f.scenario,summary:f.result,quotes:f.quotes}),quotes:()=>f.quotes};
 assert.equal(sydneyDate('2026-11-21T14:00:00Z'),'2026-11-22');const r=selectionSlate(store,{date:sydneyDate(game.datetime),now:f.now});assert.equal(r.games.length,1);assert.equal(r.games[0].selections.length,4);
 game.status_state='final';assert.equal(selectionSlate(store,{date:sydneyDate(game.datetime),now:f.now}).games[0].selections.length,0);
});
test('selections API stays behind login, validates dates and returns the same four ranked selections as the matchup',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nba-shortlist-')),{server,store}=createApp({dataDir:dir,passwordHash:hashPassword('test-long-password-for-shortlist'),autoCollect:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{const f=shortlistFixture(Date.now()),game={id:100,datetime:f.scenario.start,status_state:'scheduled',home_team:{full_name:'Home Team'},visitor_team:{full_name:'Away Team'}};f.quotes.push(f.quote('player_pa','under',30.5,.85,'espn:player:100','player_points_assists'));store.saveCache('nba-schedule',{fetchedAt:f.scenario.asOf,games:[game]});store.saveScenario(f.scenario);store.record('runs',{scenario:f.scenario,summary:f.result,quotes:f.quotes},f.scenario.id);store.importQuotes(f.quotes);
  assert.equal((await fetch(url+'/api/nba/selections')).status,401);
  const login=await fetch(url+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'test-long-password-for-shortlist'})});assert.equal(login.status,200);const headers={cookie:login.headers.get('set-cookie').split(';')[0]},path='/api/nba/selections?date='+sydneyDate(game.datetime),response=await fetch(url+path,{headers});assert.equal(response.status,200);const data=await response.json();assert.equal(data.games[0].selections.length,4);assert.deepEqual(data.games[0].selections.map(q=>q.modelProbability),[.85,.71,.67,.65]);assert.equal(data.games[0].selections[0].relatedProps[0].modelProbability,.78);
  assert.equal((await fetch(url+'/api/nba/selections?date=2026-02-31',{headers})).status,400);assert.equal((await fetch(url+path+'&family=moneyline',{headers})).status,400);assert.equal((await fetch(url+'/top-selections.js',{headers})).status,200);
 }finally{await new Promise(r=>server.close(r));store.db.close();rmSync(dir,{recursive:true});}
});
