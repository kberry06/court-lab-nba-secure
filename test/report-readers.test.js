import test from 'node:test';import assert from 'node:assert/strict';import {openStore} from '../src/store.js';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createApp} from '../src/server.js';
test('report readers filter before loading, omit quote payloads, retain originals and disclose truncation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nba-report-readers-')),store=openStore(dir),at=Date.parse('2026-11-22T12:00:00Z');
 try{for(let i=0;i<4;i++){
  const start=new Date(at-(i?i:40)*86400000).toISOString(),freeze=new Date(Date.parse(start)-3600000).toISOString(),s={id:'game:'+i,start,asOf:freeze,demo:false,teams:[]},summary={modelVersion:'v1',generatedAt:freeze,asOf:freeze,homeWin:.6,home:{mean:110},away:{mean:100},players:[]},body=JSON.stringify({scenario:s,summary,quotes:[{huge:'x'.repeat(1024*1024)}]});store.freezeForecast(s,summary,Date.parse(freeze));store.db.prepare('INSERT INTO runs VALUES(?,?,?,?)').run('run:'+i,s.id,new Date(Date.parse(freeze)+10).toISOString(),body);
 }
 const all=store.performanceForecasts(at,{days:7}),small=store.performanceForecasts(at,{days:7,limit:2});assert.equal(all.length,3);assert.equal(all.readCoverage.truncated,false);assert.equal(small.length,2);assert.equal(small.readCoverage.truncated,true);assert.ok(all.every(r=>r.run.quotes===undefined));assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n,4);assert.ok(store.db.prepare('SELECT length(body) AS n FROM runs LIMIT 1').get().n>1024*1024);
 }finally{store.db.close();assert.ok(dir.startsWith(join(tmpdir(),'nba-report-readers-')));rmSync(dir,{recursive:true});}
});
test('read-only audit endpoint validates its window and represents empty evidence honestly',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nba-report-readers-')),{server,store}=createApp({dataDir:dir,autoCollect:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{const response=await fetch(url+'/api/research/player-audit?days=7');assert.equal(response.status,200);const report=await response.json();assert.deepEqual(report.models,[]);assert.deepEqual(report.currentInputs,[]);assert.equal(report.readCoverage.forecasts.truncated,false);assert.equal((await fetch(url+'/api/research/player-audit?days=99')).status,400);}
 finally{await new Promise(r=>server.close(r));store.db.close();assert.ok(dir.startsWith(join(tmpdir(),'nba-report-readers-')));rmSync(dir,{recursive:true});}
});
