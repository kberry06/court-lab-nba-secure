import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export function openStore(dir) {
  mkdirSync(dir,{recursive:true});const db=new DatabaseSync(join(dir,'nba.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO migrations VALUES(1);
    CREATE TABLE IF NOT EXISTS scenarios(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS data_cache(key TEXT PRIMARY KEY,saved_at INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mappings(source TEXT,kind TEXT,external_id TEXT,canonical_id TEXT,created_at TEXT, PRIMARY KEY(source,kind,external_id));
    CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,observed_at TEXT NOT NULL,body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS quotes_event ON quotes(event_id,observed_at);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,event_id TEXT,created_at TEXT,body TEXT);
    CREATE INDEX IF NOT EXISTS runs_event ON runs(event_id,created_at);
    CREATE TABLE IF NOT EXISTS frozen_forecasts(event_id TEXT PRIMARY KEY,frozen_at TEXT NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS model_forecasts(event_id TEXT NOT NULL,model_version TEXT NOT NULL,frozen_at TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(event_id,model_version));
    INSERT OR IGNORE INTO model_forecasts SELECT event_id,COALESCE(json_extract(body,'$.modelVersion'),'legacy-unknown'),frozen_at,body FROM frozen_forecasts;
    INSERT OR IGNORE INTO migrations VALUES(2);
    CREATE TABLE IF NOT EXISTS outcomes(event_id TEXT PRIMARY KEY,settled_at TEXT NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,created_at TEXT,body TEXT);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,created_at TEXT,action TEXT,body TEXT);`);
  return {db,
    cache:key=>{const r=db.prepare('SELECT saved_at,body FROM data_cache WHERE key=?').get(key);return r?{savedAt:r.saved_at,body:JSON.parse(r.body)}:null;},
    saveCache:(key,body)=>db.prepare('INSERT INTO data_cache VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET saved_at=excluded.saved_at,body=excluded.body').run(key,Date.now(),JSON.stringify(body)),
    scenarios:()=>db.prepare('SELECT body FROM scenarios').all().map(r=>JSON.parse(r.body)),
    scenario:id=>{const r=db.prepare('SELECT body FROM scenarios WHERE id=?').get(id);return r?JSON.parse(r.body):null;},
    saveScenario:s=>db.prepare('INSERT INTO scenarios VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(s.id,JSON.stringify(s)),
    map:m=>{const existing=db.prepare('SELECT canonical_id FROM mappings WHERE source=? AND kind=? AND external_id=?').get(m.source,m.kind,m.externalId);if(existing&&existing.canonical_id!==m.canonicalId)throw new Error('Conflicting mapping requires reviewed migration');db.prepare('INSERT OR IGNORE INTO mappings VALUES(?,?,?,?,?)').run(m.source,m.kind,m.externalId,m.canonicalId,new Date().toISOString());},
    resolve:(source,kind,id)=>db.prepare('SELECT canonical_id FROM mappings WHERE source=? AND kind=? AND external_id=?').get(source,kind,id)?.canonical_id,
    mappings:()=>db.prepare('SELECT * FROM mappings').all(),
    importQuotes:qs=>{db.exec('BEGIN');try {let count=0;for(const q of qs){const {receivedAt,...identity}=q;const id=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(identity).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');count+=db.prepare('INSERT INTO quotes VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,q.eventId,q.observedAt,JSON.stringify(q)).changes;}db.exec('COMMIT');return count;}catch(e){db.exec('ROLLBACK');throw e;}},
    quotes:id=>{const rows=db.prepare('SELECT body FROM quotes WHERE event_id=? ORDER BY observed_at DESC').all(id).map(r=>JSON.parse(r.body));const seen=new Set();return rows.filter(q=>{const key=JSON.stringify([q.source,q.bookmaker,q.market,q.selection,q.line,q.playerId]);if(seen.has(key))return false;seen.add(key);return true;});},
    latestRun:id=>{const r=db.prepare('SELECT id,created_at,body FROM runs WHERE event_id=? ORDER BY created_at DESC LIMIT 1').get(id);return r?{id:r.id,createdAt:r.created_at,...JSON.parse(r.body)}:null;},
    freezeForecast:(scenario,summary,at=Date.now())=>{if(scenario.demo||at>=Date.parse(scenario.start))return false;const body={eventId:scenario.id,start:scenario.start,frozenAt:new Date(at).toISOString(),trainingCutoff:scenario.asOf,probability:summary.homeWin,predictedHome:summary.home.mean,predictedAway:summary.away.mean,modelVersion:summary.modelVersion,artifactTrainedThrough:summary.trainingLastGameAt||null,synthetic:false};db.exec('BEGIN');try{const old=db.prepare('INSERT OR IGNORE INTO frozen_forecasts VALUES(?,?,?)').run(scenario.id,body.frozenAt,JSON.stringify(body)).changes,perModel=db.prepare('INSERT OR IGNORE INTO model_forecasts VALUES(?,?,?,?)').run(scenario.id,body.modelVersion||'legacy-unknown',body.frozenAt,JSON.stringify(body)).changes;db.exec('COMMIT');return old+perModel>0;}catch(e){db.exec('ROLLBACK');throw e;}},
    settleGames:(games,at=Date.now())=>{let count=0;for(const g of games){if((g.status_state||g.status)!=='final'||!Number.isFinite(g.home_team_score)||!Number.isFinite(g.visitor_team_score)||g.home_team_score===g.visitor_team_score)continue;const eventId=`espn:game:${g.id}`,forecast=db.prepare('SELECT 1 FROM frozen_forecasts WHERE event_id=?').get(eventId);if(!forecast)continue;const settledAt=new Date(Math.max(at,Date.parse(g.datetime||g.date)+1)).toISOString(),body={actualHome:g.home_team_score,actualAway:g.visitor_team_score};count+=db.prepare('INSERT OR IGNORE INTO outcomes VALUES(?,?,?)').run(eventId,settledAt,JSON.stringify(body)).changes;}return count;},
    historicalForecasts:()=>db.prepare('SELECT f.body AS forecast,o.settled_at,o.body AS outcome FROM frozen_forecasts f JOIN outcomes o USING(event_id) ORDER BY f.frozen_at').all().map(r=>({...JSON.parse(r.forecast),settledAt:r.settled_at,...JSON.parse(r.outcome)})),
    modelForecasts:version=>db.prepare('SELECT f.body AS forecast,o.settled_at,o.body AS outcome FROM model_forecasts f JOIN outcomes o USING(event_id) WHERE f.model_version=? ORDER BY f.frozen_at').all(version).map(r=>({...JSON.parse(r.forecast),settledAt:r.settled_at,...JSON.parse(r.outcome)})),
    record:(table,body,eventId=null)=>{if(!['runs','reports','audit'].includes(table))throw new Error('Invalid table');const id=randomUUID(),at=new Date().toISOString();if(table==='runs')db.prepare('INSERT INTO runs VALUES(?,?,?,?)').run(id,eventId,at,JSON.stringify(body));else if(table==='reports')db.prepare('INSERT INTO reports VALUES(?,?,?)').run(id,at,JSON.stringify(body));else db.prepare('INSERT INTO audit VALUES(?,?,?,?)').run(id,at,body.action,JSON.stringify(body));return id;},
    latestReport:()=>{const r=db.prepare('SELECT body FROM reports ORDER BY created_at DESC LIMIT 1').get();return r?JSON.parse(r.body):null;}
  };
}

