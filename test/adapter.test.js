import test from 'node:test';import assert from 'node:assert/strict';import {mapProviderEvents,registerExactMatches} from '../src/adapter.js';import {demoScenario} from '../src/demo.js';
test('provider adapter quarantines unknown IDs and only maps reviewed orientation',()=>{const s=demoScenario(),event={id:'provider1',home_team:'Boston Celtics',away_team:'New York Knicks',commence_time:s.start,bookmakers:[{key:'sportsbet',last_update:'2026-10-13T10:00:00Z',markets:[{key:'h2h',outcomes:[{name:'Boston Celtics',price:1.8},{name:'New York Knicks',price:2.1}]}]}]};const store={resolve:()=>null,scenario:id=>id===s.id?s:null};assert.equal(mapProviderEvents([event],store).quarantine.length,1);store.resolve=(source,kind,id)=>kind==='event'?s.id:id==='Boston Celtics'?s.teams[0].id:s.teams[1].id;const r=mapProviderEvents([event],store,{rightsBasis:'test',now:Date.parse('2026-10-13T11:00:00Z')});assert.equal(r.quotes.length,2);assert.equal(r.quarantine.length,0);assert.equal(r.quotes[0].selection,'home');});

test('automatic mapping accepts a unique exact matchup when listed tip-offs differ by minutes',()=>{
 const scenario={...demoScenario(),id:'game:heat-hornets',demo:false,start:'2026-10-24T22:00:00.000Z',teams:[{...demoScenario().teams[0],id:'team:hornets',name:'Charlotte Hornets'},{...demoScenario().teams[1],id:'team:heat',name:'Miami Heat'}]};
 const event={id:'odds:heat-hornets',home_team:'Charlotte Hornets',away_team:'Miami Heat',commence_time:'2026-10-24T22:10:00.000Z',bookmakers:[]};
 const mappings=[];const store={scenarios:()=>[scenario],map:m=>mappings.push(m)};
 registerExactMatches([event],store);
 assert.deepEqual(mappings.map(m=>[m.kind,m.externalId,m.canonicalId]),[['event',event.id,scenario.id],['team','Charlotte Hornets','team:hornets'],['team','Miami Heat','team:heat']]);
});

test('automatic mapping keeps ambiguous or materially different tip-offs quarantined',()=>{
 const base={...demoScenario(),demo:false,teams:[{...demoScenario().teams[0],name:'Charlotte Hornets'},{...demoScenario().teams[1],name:'Miami Heat'}]};
 const event={id:'odds:heat-hornets',home_team:'Charlotte Hornets',away_team:'Miami Heat',commence_time:'2026-10-24T22:10:00.000Z',bookmakers:[]};
 for(const scenarios of [[{...base,start:'2026-10-24T21:00:00.000Z'}],[{...base,id:'one',start:'2026-10-24T22:00:00.000Z'},{...base,id:'two',start:'2026-10-24T22:20:00.000Z'}]]){
  const mappings=[];registerExactMatches([event],{scenarios:()=>scenarios,map:m=>mappings.push(m)});assert.equal(mappings.length,0);
 }
});

test('unique punctuation variants map while ambiguous identities remain unmapped',()=>{
 const s={...demoScenario(),demo:false};s.teams[0].players=[{...s.teams[0].players[0],name:'Michael Porter Jr.'}];
 const e={id:'e',home_team:s.teams[0].name,away_team:s.teams[1].name,commence_time:s.start,bookmakers:[{markets:[{outcomes:[{description:'Michael Porter Jr'}]}]}]};
 const mappings=[];registerExactMatches([e],{scenarios:()=>[s],map:m=>mappings.push(m)});assert.equal(mappings.filter(m=>m.kind==='player').length,1);assert.equal(mappings.at(-1).externalId,'e:Michael Porter Jr');
 s.teams[1].players.push({...s.teams[0].players[0],id:'ambiguous'});mappings.length=0;registerExactMatches([e],{scenarios:()=>[s],map:m=>mappings.push(m)});assert.equal(mappings.filter(m=>m.kind==='player').length,0);
});
