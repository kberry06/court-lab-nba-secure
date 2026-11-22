import {JOINT_MINUTE_VERSION,weightedMinuteBudget} from '../src/joint-minute-budget.js';
import {balanceParticipation} from '../src/participation-balance.js';
import {regimeFeatures,predictRegimeTrees} from '../src/role-regime-features.js';import {estimatePlayer} from '../src/player-estimator.js';import {minuteAcceptance} from '../src/minute-acceptance.js';
import {roleMinuteBudget,roleMinuteSd} from '../src/rotation-minutes.js';
import {priceQuote} from '../src/odds.js';
import {simulate} from '../src/model.js';
import {walkForwardFamilyCalibration} from '../src/market-calibration.js';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createAllocationState,releaseBefore,buildReplayTeam,pluginProjection,newErrorAccumulator,addPlayerError,finishErrors,evaluateDraws,deterministicGameHash,pairedAllocationBootstrap} from '../src/allocation-replay.js';
const root=new URL('../',import.meta.url),read=path=>fs.readFile(new URL(path,root),'utf8');
const [gameRaw,playerRaw,forecastRaw,parameterRaw,protocolRaw]=await Promise.all(['data/generated/nba-games-2019-2026.json','data/generated/nba-player-history-2019-2026.ndjson','data/generated/accuracy-research-1.json','player-model-artifact.json','experiments/allocation-v1.json'].map(read));
const games=JSON.parse(gameRaw).games.sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime)||a.id-b.id),records=playerRaw.trim().split('\n').map(JSON.parse),byGame=Object.groupBy(records,r=>r.gameId),forecast=JSON.parse(forecastRaw),parameters=JSON.parse(parameterRaw),protocol=JSON.parse(protocolRaw);
const gameArtifactRaw=await read('game-model-artifact.json'),gameArtifact=JSON.parse(gameArtifactRaw);
if(parameters.sourceSha256!==createHash('sha256').update(playerRaw).digest('hex')||gameArtifact.sourceSha256!==createHash('sha256').update(gameRaw).digest('hex'))throw new Error('Research artifact/archive checksum mismatch');
if(protocol.version!=='allocation-replay-1'||protocol.monteCarloDraws!==10000||protocol.appearanceWindow!==10)throw new Error('Unsupported allocation replay protocol');
const predictions=new Map(forecast.predictions.map(r=>[r.id,r])),trainingThrough=new Map(),sampleIds=new Set();
for(const season of [...new Set(games.map(g=>g.season))]){trainingThrough.set(season,games.filter(g=>g.season<season).at(-1)?.datetime);const eligible=games.filter(g=>g.season===season&&g.season>=protocol.evaluationStarts&&predictions.has(g.id)&&byGame[g.id]);eligible.sort((a,b)=>deterministicGameHash(a.id)-deterministicGameHash(b.id)||a.id-b.id);for(const g of eligible.slice(0,protocol.monteCarloGamesPerSeason))sampleIds.add(g.id);}
const rateRows=[];
const state=createAllocationState(),pending=[],folds=new Map(),tasks=[],coverage={scheduledEvaluationGames:0,evaluatedGames:0,skipped:{},actualPositivePlayers:0,coveredPositivePlayers:0,missingPositivePlayers:0,unobservedCandidatePlayers:0,staleProxyTeamRosters:0,proxyTeamRosters:0},skipped=(reason)=>coverage.skipped[reason]=(coverage.skipped[reason]||0)+1;
let season=null,seasonPriors,processed=0;
const fresh=()=>({games:0,rawPositive:newErrorAccumulator(),baselineAll:newErrorAccumulator(),candidateAll:newErrorAccumulator(),baselinePositive:newErrorAccumulator(),candidatePositive:newErrorAccumulator()});
const exposureProbability=(p,teamId)=>{const listed=roleListed.get(p.numericId)||[],history=state.teamRotations.get(teamId)||[],reports=history.slice(0,10);if(listed.length>=2&&listed[0].teamId!==listed[1].teamId)return (1+listed.slice(0,10).filter(r=>r.minutes>0&&!r.didNotPlay).length)/(2+Math.min(10,listed.length));if(!reports.length)return 1;return (1+reports.filter(r=>(r.minutes[p.id]||0)>0).length)/(2+reports.length);};
const learned=JSON.parse(await read('data/generated/minute-regime-models.json')).models,roleHistory=new Map(),roleListed=new Map(),roleQueue=[],wideTeams=new Map(),lastTeams=new Map();
const enrich=(team,scenario)=>{const model=learned.find(m=>m.season===scenario.season);if(!model||Date.parse(model.trainingLastSettledAt)>=Date.parse(scenario.asOf))throw new Error('Minute training cutoff mismatch');const players=team.players.map(p=>({...p,priorStarter:(()=>{const roles=(roleListed.get(p.numericId)||[]).slice(0,5).filter(r=>typeof r.starterObserved==='boolean');return roles.length>=3&&roles.every(r=>r.starterObserved);})(),availability:exposureProbability(p,Number(team.id.split(':').at(-1))),roleMinutes:predictRegimeTrees(model,regimeFeatures(roleHistory.get(p.numericId)||[],roleListed.get(p.numericId)||[],scenario.asOf,{baseline:p.rawMinutes,expectedMargin:scenario.margin}))})),budget=roleMinuteBudget(players.map(p=>p.roleMinutes)),balanced=balanceParticipation(players.map(p=>p.roleMinutes),players.map(p=>p.availability));return {...team,roleMassFeasible:balanced.feasible,players:players.map((p,i)=>({...p,minutes:budget[i],availability:balanced.probabilities[i]}))};};
for(const g of games){const cutoff=Date.parse(g.datetime)-protocol.forecastHoursBeforeStart*3600000;
 while(roleQueue.length&&Date.parse(roleQueue[0][0].datetime)+86400000<cutoff){for(const r of roleQueue.shift()){const l=roleListed.get(r.playerId)||[];l.unshift(r);l.splice(20);roleListed.set(r.playerId,l);if(r.minutes>0&&!r.didNotPlay){const h=roleHistory.get(r.playerId)||[];h.unshift(r);h.splice(20);roleHistory.set(r.playerId,h);}lastTeams.set(r.playerId,r.teamId);const team=wideTeams.get(r.teamId)||new Map();team.set(r.playerId,r);wideTeams.set(r.teamId,team);}}
 releaseBefore(state,pending,cutoff,protocol.resultEmbargoHours);
 if(season!==g.season){season=g.season;seasonPriors=state.league.minutes?Object.fromEntries(['points','rebounds','assists'].map(k=>[k,state.league[k]/state.league.minutes])):undefined;}
 const actual=byGame[g.id];
 if(actual){const fold=parameters.folds.find(f=>f.season===g.season);if(fold){const match=/half(\d+)-prior(\d+)/.exec(fold.selected),params={halfLife:Number(match[1]),priorMinutes:Number(match[2]),leaguePriors:seasonPriors};for(const a of actual){if(a.minutes<5||a.didNotPlay)continue;const history=state.history.get(a.playerId)||[];if(history.length<5)continue;const rate=estimatePlayer(history,params);rateRows.push({season:g.season,date:g.datetime,minutes:a.minutes,actual:Object.fromEntries(['points','rebounds','assists'].map(k=>[k,a[k]])),mean:Object.fromEntries(['points','rebounds','assists'].map(k=>[k,a.minutes*rate[k]]))});}}}

 if(g.season>=protocol.evaluationStarts){coverage.scheduledEvaluationGames++;const prediction=predictions.get(g.id),fold=parameters.folds.find(f=>f.season===g.season);
  if(!prediction||!actual||!fold){skipped(!prediction?'missing earlier-season game forecast':!actual?'missing audited player box score':'missing earlier-season player parameters');}
  else {const match=/half(\d+)-prior(\d+)/.exec(fold.selected);if(!match)throw new Error('Unknown season parameter selection');const params={halfLife:Number(match[1]),priorMinutes:Number(match[2]),leaguePriors:seasonPriors};
   let baseline,candidate;try{baseline=[g.home_team,g.visitor_team].map(t=>buildReplayTeam(state,t,cutoff,params));candidate=[g.home_team,g.visitor_team].map(t=>buildReplayTeam(state,t,cutoff,params,{candidate:true}));}catch(error){skipped(error.message);}
   if(baseline?.every(Boolean)&&candidate?.every(Boolean)){
    const ids=baseline.flatMap(t=>t.players.map(p=>p.id));if(new Set(ids).size!==ids.length)throw new Error('Ambiguous proxy roster across opponents');
    const actualIndex=new Map(actual.map(r=>[r.playerId,r])),targetIds=new Set(ids.map(s=>Number(s.split(':').at(-1))));
    coverage.evaluatedGames++;for(const r of actual.filter(r=>r.minutes>0)){coverage.actualPositivePlayers++;if(targetIds.has(r.playerId))coverage.coveredPositivePlayers++;else coverage.missingPositivePlayers++;}
    if(!folds.has(g.season))folds.set(g.season,fresh());const report=folds.get(g.season);report.games++;
    for(let side=0;side<2;side++){coverage.proxyTeamRosters++;if(baseline[side].rosterAgeDays>30)coverage.staleProxyTeamRosters++;const score=(prediction.expectedTotal+(side===0?1:-1)*prediction.expectedMargin)/2,b=pluginProjection(baseline[side],score),c=new Map(pluginProjection(candidate[side],score).map(p=>[p.id,p]));
     for(const p of b){const outcome=actualIndex.get(p.id);if(!outcome){coverage.unobservedCandidatePlayers++;continue;}const next=c.get(p.id);addPlayerError(report.baselineAll,p.final,outcome);addPlayerError(report.candidateAll,next.final,outcome);if(outcome.minutes>0){addPlayerError(report.rawPositive,p.raw,outcome);addPlayerError(report.baselinePositive,p.final,outcome);addPlayerError(report.candidatePositive,next.final,outcome);}}
    }
    if(sampleIds.has(g.id)){const scenario={id:'espn:game:'+g.id,start:g.datetime,asOf:new Date(cutoff).toISOString(),source:'Retrospective proxy-roster allocation diagnostic',demo:false,gameForecast:{trainingLastGameAt:trainingThrough.get(g.season),probability:prediction.probability,marginMean:prediction.expectedMargin,marginScale:prediction.marginScale,totalMean:prediction.expectedTotal,totalSd:Math.max(5,Math.min(50,prediction.totalSd)),rho:0}};const incumbent=baseline.map(t=>{const budget=roleMinuteBudget(t.players.map(p=>p.rawMinutes));return {...t,players:t.players.map((p,i)=>({...p,minutes:budget[i],roleMinutes:p.rawMinutes,minuteSd:roleMinuteSd(state.history.get(p.numericId)||[])}))};});
const expanded=[g.home_team,g.visitor_team].map((team,side)=>{const pool=[...(wideTeams.get(team.id)?.values()||[])].filter(r=>lastTeams.get(r.playerId)===team.id).sort((a,b)=>Date.parse(b.datetime)-Date.parse(a.datetime)||a.playerId-b.playerId).slice(0,20),players=pool.map(r=>{const e=estimatePlayer(state.history.get(r.playerId)||[],params);return {id:'espn:player:'+r.playerId,numericId:r.playerId,name:r.name||String(r.playerId),rawMinutes:e.minutes,roleMinutes:e.minutes,minutes:e.minutes,minuteSd:roleMinuteSd(state.history.get(r.playerId)||[]),availability:1,impact:0,points:e.points,rebounds:e.rebounds,assists:e.assists};}).sort((a,b)=>b.minutes-a.minutes),budget=roleMinuteBudget(players.map(p=>p.roleMinutes));return {...incumbent[side],players:players.map((p,i)=>({...p,minutes:budget[i]}))};});
const context={season:g.season,asOf:scenario.asOf,margin:scenario.gameForecast.marginMean};tasks.push({game:g,actual,standard:{incumbent:{...scenario,rotationMode:'role-budget-research-1',teams:incumbent},candidate:{...scenario,rotationMode:'role-budget-research-1',teams:incumbent.map(t=>enrich(t,context))}},expanded:{incumbent:{...scenario,rotationMode:'role-budget-research-1',teams:expanded},candidate:{...scenario,rotationMode:'role-budget-research-1',teams:expanded.map(t=>enrich(t,context))}}});}
   }else if(baseline||candidate)skipped('fewer than six eligible prior-roster players');
  }
 }
 if(actual){pending.push(actual);roleQueue.push(actual);}if(++processed%1500===0)console.log('Chronological games processed: '+processed);
}




for(const task of tasks)for(const pool of ['standard','expanded']){const s=task[pool].candidate;s.rotationMode=JOINT_MINUTE_VERSION;s.teams=s.teams.map(t=>{const minutes=weightedMinuteBudget(t.players.map(p=>p.roleMinutes*p.availability),t.players.map(p=>(p.minuteSd??6)**2),t.players.map(p=>p.availability>0));return {...t,players:t.players.map((p,i)=>({...p,minutes:minutes[i]}))};});}
await fs.writeFile(new URL('data/generated/count-replay-inputs.json',root),JSON.stringify({tasks,rateRows,sourceHashes:{games:createHash('sha256').update(gameRaw).digest('hex'),players:createHash('sha256').update(playerRaw).digest('hex')}}));
console.log(JSON.stringify({games:tasks.length,rateCases:rateRows.length}));
