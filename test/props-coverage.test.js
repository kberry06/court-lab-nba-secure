import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchApprovedOdds,REQUESTED_PLAYER_MARKETS,priceQuote,addNoVig} from '../src/odds.js';
import {mapProviderEvents,propCoverage} from '../src/adapter.js';
import {demoScenario} from '../src/demo.js';
const s=demoScenario(),now=Date.parse('2026-10-13T11:00:00Z'),player=s.teams[0].players[0];
test('event request includes documented standard and alternate markets for all seven metrics',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async url=>{assert.equal(url.hostname,'api.the-odds-api.com');assert.equal(url.searchParams.get('bookmakers'),'sportsbet');assert.deepEqual(url.searchParams.get('markets').split(','),REQUESTED_PLAYER_MARKETS);assert.equal(REQUESTED_PLAYER_MARKETS.length,14);return {ok:true,json:async()=>({bookmakers:[]})};};
 await fetchApprovedOdds({ODDS_PROVIDER:'the-odds-api',ODDS_FEED_APPROVED:'true',ODDS_API_KEY:'test-only'},'event1');
});
test('one unknown player or unsupported market cannot discard valid alternate props',()=>{
 const event={id:'e1',home_team:s.teams[0].name,away_team:s.teams[1].name,commence_time:s.start,bookmakers:[{key:'sportsbet',last_update:'2026-10-13T10:59:00Z',markets:[{key:'player_blocks',outcomes:[]},{key:'player_points_alternate',outcomes:[{name:'Over',description:'Unknown player',point:14.5,price:4.1},{name:'Over',description:player.name,point:14.5,price:4.1},{name:'Over',description:player.name,point:19.5,price:8}]}]}]};
 const store={resolve:(_,kind,id)=>kind==='event'?s.id:kind==='player'?(id===`e1:${player.name}`?player.id:null):id===s.teams[0].name?s.teams[0].id:s.teams[1].id,scenario:()=>s};
 const mapped=mapProviderEvents([event],store,{rightsBasis:'test',now});assert.equal(mapped.quotes.length,2);assert.equal(mapped.quarantine.length,2);assert.equal(mapped.quotes[0].line,14.5);assert.equal(mapped.quotes[0].providerMarket,'player_points_alternate');assert.equal(addNoVig(mapped.quotes)[0].bookFairProbability,null);
 const coverage=propCoverage(event,mapped);assert.equal(coverage.returned,3);assert.equal(coverage.accepted,2);assert.equal(coverage.issues[1].player,'Unknown player');
});
test('15+ equivalent over 14.5 wins at 15, loses at 14 and voids DNP',()=>{
 const q={market:'player_points',playerId:player.id,selection:'over',line:14.5,price:4.1,observedAt:'2026-10-13T10:59:00Z'};
 const sim={samples:{margin:[],players:{[player.id]:{points:[14,15,20,0],rebounds:[2,3,4,0],assists:[1,2,3,0],active:[true,true,true,false]}}}};
 const r=priceQuote(q,sim,s,now);assert.equal(r.modelProbability,2/3);assert.equal(r.pushProbability,0);assert.equal(r.voidProbability,.25);
 for(const [market,line] of [['player_pa',16.5],['player_ra',4.5],['player_pr',17.5],['player_pra',19.5]])assert.equal(priceQuote({...q,market,line},sim,s,now).modelProbability,2/3);
});
test('empty feed coverage does not claim Sportsbet website has no props',()=>{
 const r=propCoverage({bookmakers:[]},{quotes:[],quarantine:[]});assert.equal(r.accepted,0);assert.match(r.note,/Sportsbet may still offer them on its website/);assert.equal(r.sportsbetPresent,false);
});
