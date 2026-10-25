import {createHash} from 'node:crypto';
import {caseWeights,calibrationMetrics,supportedFamilies,fitMarketFamily} from './market-calibration.js';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function matchedForecasts(scenario,summary,quotes,{at=Date.now(),modelKey,inputSnapshot,variant='default',runId=null}={}){
 if(typeof modelKey!=='string'||!modelKey)throw new Error('Model fingerprint required');
 const start=Date.parse(scenario.start),forecastAt=new Date(at).toISOString(),rows=[],skipped={};
 if(scenario.demo||at>=start)return {rows,skipped:{'demo or already started':quotes.length}};
 const horizonMinutes=(start-at)/60000,bucket=horizonMinutes>360?'early':horizonMinutes>60?'6h':horizonMinutes>15?'1h':'15m';
 for(const q of quotes){const observed=Date.parse(q.observedAt),received=Date.parse(q.receivedAt);let reason=null;
  if(q.eventId!==scenario.id||q.period!=='full_game'||q.includesOvertime!==true)reason='event or settlement mismatch';
  else if(!Number.isFinite(observed)||!Number.isFinite(received)||observed>at||received>at)reason='quote not available by forecast time';
  else if(at-observed>15*60000)reason='quote older than 15 minutes';
  else if((!Number.isFinite(q.modelProbability)||q.modelProbability<0||q.modelProbability>1))reason='no decisive simulated outcomes';
  if(reason){skipped[reason]=(skipped[reason]||0)+1;continue;}
  const blockers=[];if(q.ingestMethod!=='approved-provider')blockers.push('independent provider ingestion unverified');if(variant!=='default')blockers.push('adjusted scenario');
  if(!inputSnapshot||Date.parse(inputSnapshot.observedAt)!==Date.parse(scenario.asOf)||!Number.isFinite(Date.parse(inputSnapshot.receivedAt))||Date.parse(inputSnapshot.receivedAt)>at||Date.parse(inputSnapshot.observedAt)>at||!inputSnapshot.payloadHash)blockers.push('matching timestamped input snapshot unavailable');
  if(at-Date.parse(scenario.asOf)>24*3600000)blockers.push('inputs older than 24 hours');
  const identity=[modelKey,scenario.id,q.bookmaker,q.market,q.playerId||null,q.selection,q.line??null,bucket,variant];
  rows.push({id:hash(identity),eventId:scenario.id,modelKey,modelVersion:summary.modelVersion,runId,variant,bucket,forecastAt,start:scenario.start,horizonMinutes,inputObservedAt:scenario.asOf,inputReceivedAt:inputSnapshot?.receivedAt||null,inputPayloadHash:inputSnapshot?.payloadHash||null,source:q.source,bookmaker:q.bookmaker,sourceEventId:q.sourceEventId,snapshotId:q.snapshotId,quoteObservedAt:q.observedAt,quoteReceivedAt:q.receivedAt,quoteAgeSeconds:(at-observed)/1000,family:q.market,playerId:q.playerId||null,selection:q.selection,line:q.line??null,price:q.price,period:q.period,includesOvertime:q.includesOvertime,dnpRule:q.dnpRule||null,probability:q.modelProbability,bookFairProbability:q.bookFairProbability??null,pushProbability:q.pushProbability,voidProbability:q.voidProbability,eligibleForCalibration:blockers.length===0,blockers});
 }return {rows,skipped};
}
export function settleMatchedForecast(f,outcome){
 if(outcome.eventId!==f.eventId||outcome.complete!==true||outcome.status!=='final'||outcome.includesOvertime!==true)throw new Error('Verified complete full-game outcome required');
 if(!Number.isFinite(Date.parse(outcome.start))||Math.abs(Date.parse(outcome.start)-Date.parse(f.start))>30*60000)return {status:'unresolved',reason:'Schedule changed; bookmaker settlement requires review'};
 let value;if(f.family==='moneyline'||f.family==='spread'){value=outcome.homeScore-outcome.awayScore;if(f.selection==='away')value=-value;if(f.family==='spread')value+=f.line;}
 else if(f.family==='total'){value=outcome.homeScore+outcome.awayScore-f.line;if(f.selection==='under')value=-value;}
 else {const p=outcome.players?.find(p=>p.id===f.playerId);if(!p)return {status:'unresolved',reason:'Player absent from verified box; DNP not inferred'};if(p.didNotPlay===true||p.minutes===0){if(f.dnpRule!=='void')throw new Error('Unsupported player settlement rule');return {status:'void',profit:0};}
  const keys={player_points:['points'],player_rebounds:['rebounds'],player_assists:['assists'],player_pra:['points','rebounds','assists'],player_pa:['points','assists'],player_ra:['rebounds','assists'],player_pr:['points','rebounds']}[f.family];if(!keys||!keys.every(k=>Number.isFinite(p[k])))return {status:'unresolved',reason:'Required player statistics unavailable'};value=keys.reduce((n,k)=>n+p[k],0)-f.line;if(f.selection==='under')value=-value;
 }
 return {status:value>0?'win':value<0?'loss':'push',profit:value>0?f.price-1:value<0?-1:0};
}
export function prospectiveReport(records,cutoff=new Date().toISOString()){
 const at=Date.parse(cutoff),settled=records.filter(r=>r.eligibleForCalibration&&r.variant==='default'&&r.result&&['win','loss','push','void'].includes(r.result.status)&&Date.parse(r.settledAt)<=at),decisive=settled.filter(r=>['win','loss'].includes(r.result.status)),families=[...new Set(records.map(r=>JSON.stringify([r.modelKey,r.family])))].map(JSON.parse);
 const report=families.map(([modelKey,family])=>{const rs=settled.filter(r=>r.family===family&&r.modelKey===modelKey),ds=caseWeights(decisive.filter(r=>r.family===family&&r.modelKey===modelKey).map(r=>({...r,y:Number(r.result.status==='win')}))),paired=ds.filter(r=>Number.isFinite(r.bookFairProbability)).map(r=>({...r,marketProbability:r.bookFairProbability}));return {modelKey,family,frozen:records.filter(r=>r.family===family&&r.modelKey===modelKey).length,settled:rs.length,decisive:ds.length,voids:rs.filter(r=>r.result.status==='void').length,pushes:rs.filter(r=>r.result.status==='push').length,model:calibrationMetrics(ds),pairedModel:calibrationMetrics(paired),pairedBookmaker:calibrationMetrics(paired,'marketProbability'),profit:rs.reduce((n,r)=>n+r.result.profit,0),note:'First capture per model/event/selection/line/time bucket; correlated selections are case weighted. Profit is descriptive, not an independent betting test.'};});
 const canonical=new Map();for(const r of decisive){if(!supportedFamilies.includes(r.family))continue;const side=r.selection==='under'||r.family==='spread'&&r.selection==='away'?-1:1,line=r.family==='spread'&&r.selection==='away'?-r.line:r.line,key=JSON.stringify([r.modelKey,r.eventId,r.family,r.playerId,line]);const row={...r,source:'prospective-matched-quotes',probability:side===-1?1-r.probability:r.probability,y:side===-1?Number(r.result.status==='loss'):Number(r.result.status==='win')};const old=canonical.get(key);if(!old||Math.abs(r.horizonMinutes-60)<Math.abs(old.horizonMinutes-60))canonical.set(key,row);}
 const modelKeys=[...new Set(decisive.map(r=>r.modelKey))],calibration=modelKeys.flatMap(modelKey=>supportedFamilies.map(family=>({modelKey,...fitMarketFamily([...canonical.values()].filter(r=>r.modelKey===modelKey),family,cutoff)})));
 return {generatedAt:cutoff,frozen:records.length,eligible:records.filter(r=>r.eligibleForCalibration).length,settled:settled.length,independentGames:new Set(settled.map(r=>r.eventId)).size,unresolved:records.filter(r=>!r.result||r.result.status==='unresolved').length,families:report,calibration,status:settled.length?'Forward evidence accumulating; no live calibration promoted':'Awaiting real matched-time outcomes',limitations:'Quotes must be received before prediction freeze and observed within 15 minutes. Input snapshots must already exist. Missing outcomes stay unresolved. Historical or manual prices are excluded from acceptance evidence. Families and model keys are fitted separately; future validation is still required.'};
}
