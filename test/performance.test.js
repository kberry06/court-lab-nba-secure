import test from 'node:test';import assert from 'node:assert/strict';
import {marketLines,compareLine,chartCeiling,metricValue,performanceWindow} from '../public/performance.js';
const now=Date.parse('2026-10-24T10:00:00Z'),quote={eventId:'game:1',playerId:'player:1',market:'player_points',bookmaker:'sportsbet',period:'full_game',includesOvertime:true,line:22.5,observedAt:'2026-10-24T09:55:00Z',price:1.9};
test('chart lines require the exact event, player, metric and Sportsbet full-game market',()=>{const quotes=[quote,{...quote,eventId:'game:2',line:30.5},{...quote,playerId:'player:2',line:8.5},{...quote,market:'player_assists',line:5.5},{...quote,bookmaker:'other',line:24.5},{...quote,period:'first_half',line:11.5}];assert.deepEqual(marketLines(quotes,'game:1','player:1','points',now).map(q=>q.line),[22.5]);assert.deepEqual(marketLines(quotes,'game:1','player:1','assists',now).map(q=>q.line),[5.5]);assert.deepEqual(marketLines(quotes,'game:1','player:1','pa',now),[]);});
test('opposite selections deduplicate, freshest lines sort first and stale quotes stay labelled',()=>{const out=marketLines([{...quote,observedAt:'2026-10-24T09:00:00Z'},{...quote,selection:'under'}, {...quote,line:23.5,observedAt:'2026-10-24T09:20:00Z'}],'game:1','player:1','points',now);assert.equal(out.length,2);assert.equal(out[0].line,22.5);assert.equal(out[0].stale,false);assert.equal(out[1].stale,true);});
test('invalid and future quote timestamps do not become chart reference lines',()=>{const rows=[{...quote,observedAt:'bad'},{...quote,observedAt:'2026-10-24T11:00:00Z'},{...quote,line:-1},{...quote,line:NaN}];assert.deepEqual(marketLines(rows,'game:1','player:1','points',now),[]);});
test('historical comparison handles half-lines, equality and missing input without counting the projection',()=>{assert.deepEqual(compareLine([10,7,13,19,8],22.5),{over:0,under:5,equal:0,count:5});assert.deepEqual(compareLine([10,22,25,22,NaN],22),{over:1,under:1,equal:2,count:4});assert.equal(compareLine([1,2],null).count,0);});
test('chart bounds include reference lines above all performances and combo metrics sum correctly',()=>{assert.ok(chartCeiling([10,7,13,19,8],7.1,22.5)>22.5);assert.equal(metricValue({points:20,rebounds:8,assists:5},'pra'),33);assert.equal(metricValue({points:20,rebounds:8,assists:5},'ra'),13);});

test('fresh main market is the default before lower alternate milestones',()=>{const out=marketLines([{...quote,line:9.5,providerMarket:'player_points_alternate'},{...quote,line:17.5,providerMarket:'player_points',selection:'over'},{...quote,line:17.5,providerMarket:'player_points',selection:'under'}],'game:1','player:1','points',now);assert.equal(out[0].line,17.5);assert.equal(out[0].main,true);assert.equal(out[1].alternate,true);});

test('history defaults to ten and five/ten/twenty windows update the average and line record on the same actual games',()=>{
 const rows=Array.from({length:25},(_,i)=>({gameId:i+1,date:new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10),points:i+1,rebounds:5,assists:3,minutes:30+i/10})),before=structuredClone(rows);
 assert.equal(performanceWindow(rows).length,10);
 for(const [count,average,over] of [[5,23,5],[10,20.5,5],[20,15.5,5]]){
  const recent=performanceWindow(rows,count),values=recent.map(r=>metricValue(r,'points'));
  assert.equal(recent.length,count);assert.equal(values.reduce((a,b)=>a+b,0)/count,average);assert.equal(compareLine(values,20.5).over,over);assert.equal(recent.at(-1).gameId,25);
 }
 assert.deepEqual(rows,before);assert.throws(()=>performanceWindow(rows,15),/5, 10 or 20/);
});
test('limited history and duplicates are counted honestly without padding or counting a projection',()=>{
 const rows=[{gameId:1,date:'2026-11-20',points:10},{gameId:1,date:'2026-11-20',points:10},{gameId:2,date:'2026-11-19',points:7},{gameId:3,date:'bad',points:99}];
 assert.deepEqual(performanceWindow(rows,20).map(r=>r.gameId),[2,1]);assert.equal(compareLine(performanceWindow(rows,20).map(r=>r.points),8.5).count,2);
});
