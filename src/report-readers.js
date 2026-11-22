// Reporting must not materialize every historical run and its quote payload.
// These readers only SELECT data; original forecasts and outcomes are untouched.
const day=86400000;
const lean="json_object('scenario',json_extract(body,'$.scenario'),'summary',json_extract(body,'$.summary'),'incumbentRunId',json_extract(body,'$.incumbentRunId'))";
function bounds(at,days){if(days!=null&&(!Number.isInteger(days)||days<1||days>30))throw new Error('Use 1–30 days');return [days==null?'0000-01-01':new Date(at-days*day).toISOString(),days==null?'9999-12-31':new Date(at).toISOString()];}
function bounded(statement,args,limit){
 const rows=[];let truncated=false;
 for(const row of statement.iterate(...args)){if(rows.length===limit){truncated=true;break;}rows.push(row);}
 Object.defineProperty(rows,'readCoverage',{value:{limit,loaded:rows.length,truncated},enumerable:false});return rows;
}
export function reportReaders(db){
 return {
  performanceForecasts(at=Date.now(),{days=null,limit=500}={}){
   const [since,until]=bounds(at,days),cutoff=new Date(at).toISOString();
   const data=bounded(db.prepare("SELECT f.body AS forecast,o.settled_at,o.body AS outcome FROM model_forecasts f LEFT JOIN outcomes o USING(event_id) WHERE json_extract(f.body,'$.start')>=? AND json_extract(f.body,'$.start')<=? ORDER BY f.frozen_at DESC LIMIT ?"),[since,until,limit+1],limit);
   const outcomeQuery=db.prepare('SELECT body,received_at FROM prospective_outcomes WHERE event_id=? AND received_at<=? ORDER BY received_at DESC,rowid DESC LIMIT 1');
   const runQuery=db.prepare(`SELECT created_at,${lean} AS body FROM (SELECT created_at,body FROM runs WHERE event_id=? UNION ALL SELECT created_at,body FROM shadow_runs WHERE event_id=?) WHERE created_at>=? AND created_at<? AND json_extract(body,'$.summary.modelVersion')=? ORDER BY created_at LIMIT 1`);
   const rows=data.map(r=>{const f=JSON.parse(r.forecast),outcome=outcomeQuery.get(f.eventId,cutoff),run=runQuery.get(f.eventId,f.eventId,f.frozenAt,new Date(Date.parse(f.frozenAt)+5000).toISOString(),f.modelVersion);return {...f,...(r.outcome?{...JSON.parse(r.outcome),settledAt:r.settled_at}:{}),...(outcome?{fullOutcome:JSON.parse(outcome.body),settledAt:outcome.received_at}:{}),run:run?{...JSON.parse(run.body),createdAt:run.created_at}:null};});
   rows.readCoverage={...data.readCoverage,days};return rows;
  },
  shadowPairs({at=Date.now(),days=null,version=null,limit=300}={}){
   const [since,until]=bounds(at,days),data=bounded(db.prepare(`SELECT event_id,created_at,${lean} AS body FROM shadow_runs WHERE json_extract(body,'$.scenario.start')>=? AND json_extract(body,'$.scenario.start')<=? AND (? IS NULL OR json_extract(body,'$.summary.modelVersion')=?) ORDER BY created_at DESC LIMIT ?`),[since,until,version,version,limit+1],limit);
   const runQuery=db.prepare(`SELECT created_at,${lean} AS body FROM runs WHERE id=?`),outcomeQuery=db.prepare('SELECT received_at,body FROM prospective_outcomes WHERE event_id=? AND received_at<=? ORDER BY received_at DESC,rowid DESC LIMIT 1');
   const rows=data.slice().reverse().map(r=>{const shadow={...JSON.parse(r.body),createdAt:r.created_at},a=runQuery.get(shadow.incumbentRunId||''),outcome=outcomeQuery.get(r.event_id,new Date(at).toISOString());return {eventId:r.event_id,shadow,incumbent:a?{...JSON.parse(a.body),createdAt:a.created_at}:null,outcome:outcome?JSON.parse(outcome.body):null,settledAt:outcome?.received_at};});rows.readCoverage={...data.readCoverage,days};return rows;
  },
  matchedRecords(cutoff=new Date().toISOString(),{days=null,limit=12000}={}){
   const at=Date.parse(cutoff),[since,until]=bounds(at,days),reportUntil=days==null?until:new Date(at+8*day).toISOString(),data=bounded(db.prepare("SELECT id,body FROM prospective_forecasts WHERE frozen_at<=? AND json_extract(body,'$.start')>=? AND json_extract(body,'$.start')<=? ORDER BY frozen_at DESC,id DESC LIMIT ?"),[cutoff,since,reportUntil,limit+1],limit),resultQuery=db.prepare('SELECT body,settled_at,outcome_hash FROM prospective_results WHERE forecast_id=? AND settled_at<=? ORDER BY settled_at DESC,rowid DESC LIMIT 1');
   const rows=data.map(r=>{const f=JSON.parse(r.body),result=resultQuery.get(f.id,cutoff);return result?{...f,result:JSON.parse(result.body),settledAt:result.settled_at,outcomeHash:result.outcome_hash}:f;});rows.readCoverage={...data.readCoverage,days};return rows;
  },
  currentPlayerInputs({at=Date.now(),names=['Bam Adebayo','Jalen Johnson','Dyson Daniels','Nickeil Alexander-Walker','Onyeka Okongwu','Jared McCain','Pelle Larsson','Ajay Mitchell']}={}){
   const wanted=new Set(names),records=db.prepare("SELECT id,body FROM scenarios WHERE json_extract(body,'$.demo')=0 AND json_extract(body,'$.start')>? AND json_extract(body,'$.start')<? ORDER BY json_extract(body,'$.start') LIMIT 20").iterate(new Date(at).toISOString(),new Date(at+7*day).toISOString()),rows=[];
   const runQuery=db.prepare("SELECT created_at,json_extract(body,'$.summary') AS summary FROM runs WHERE event_id=? ORDER BY created_at DESC LIMIT 1");
   for(const r of records){const scenario=JSON.parse(r.body),focus=scenario.teams.flatMap(t=>t.players.map(p=>({t,p}))).filter(({p})=>wanted.has(p.name));if(!focus.length)continue;const run=runQuery.get(r.id),summary=run?JSON.parse(run.summary):null;
    for(const {t,p} of focus){const final=summary?.asOf===scenario.asOf?summary.players.find(x=>x.id===p.id):null,positive=(p.recent||[]).filter(x=>Number.isFinite(x.minutes)&&x.minutes>0),mean=(list,key)=>{const valid=list.map(r=>r[key]).filter(Number.isFinite);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null;};
     rows.push({eventId:r.id,start:scenario.start,asOf:scenario.asOf,generatedAt:summary?.generatedAt||null,modelVersion:summary?.modelVersion||null,name:p.name,playerId:p.id,team:t.name,injury:p.injury,availability:p.availability,sampleGames:p.sampleGames,rawRoleMinutes:p.roleMinutes??null,baselineAllocatedMinutes:p.minutes,simulatedMinutes:final?.conditional?.minutes?.mean??null,rawRates:{points:p.points,rebounds:p.rebounds,assists:p.assists},projection:final?Object.fromEntries(['points','rebounds','assists'].map(k=>[k,final.conditional?.[k]?.mean??null])):null,recentFive:Object.fromEntries(['minutes','points','rebounds','assists'].map(k=>[k,mean(positive.slice(0,5),k)])),recentTen:Object.fromEntries(['minutes','points','rebounds','assists'].map(k=>[k,mean(positive.slice(0,10),k)])),teamRawRoleTotal:t.players.reduce((n,p)=>n+(p.roleMinutes??p.minutes),0),teamBaselineMinutes:t.players.reduce((n,p)=>n+p.minutes,0),rosterPlayers:t.players.length,expectedParticipants:summary?.players.filter(x=>x.teamId===t.id).reduce((n,p)=>n+p.appearanceProbability,0)??null,note:final?'Same-observation saved projection; not a settled outcome.':'Saved scenario and projection do not match; projection withheld.'});
    }
   }return rows;
  }
 };
}
