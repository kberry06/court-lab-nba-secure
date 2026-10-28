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
const state=createAllocationState(),pending=[],folds=new Map(),tasks=[],coverage={scheduledEvaluationGames:0,evaluatedGames:0,skipped:{},actualPositivePlayers:0,coveredPositivePlayers:0,missingPositivePlayers:0,unobservedCandidatePlayers:0,staleProxyTeamRosters:0,proxyTeamRosters:0},skipped=(reason)=>coverage.skipped[reason]=(coverage.skipped[reason]||0)+1;
let season=null,seasonPriors,processed=0;
const fresh=()=>({games:0,rawPositive:newErrorAccumulator(),baselineAll:newErrorAccumulator(),candidateAll:newErrorAccumulator(),baselinePositive:newErrorAccumulator(),candidatePositive:newErrorAccumulator()});
for(const g of games){const cutoff=Date.parse(g.datetime)-protocol.forecastHoursBeforeStart*3600000;
 releaseBefore(state,pending,cutoff,protocol.resultEmbargoHours);
 if(season!==g.season){season=g.season;seasonPriors=state.league.minutes?Object.fromEntries(['points','rebounds','assists'].map(k=>[k,state.league[k]/state.league.minutes])):undefined;}
 const actual=byGame[g.id];
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
    if(sampleIds.has(g.id)){const scenario={id:'espn:game:'+g.id,start:g.datetime,asOf:new Date(cutoff).toISOString(),source:'Retrospective proxy-roster allocation diagnostic',demo:false,gameForecast:{trainingLastGameAt:trainingThrough.get(g.season),probability:prediction.probability,marginMean:prediction.expectedMargin,marginScale:prediction.marginScale,totalMean:prediction.expectedTotal,totalSd:Math.max(5,Math.min(50,prediction.totalSd)),rho:0}};const joint=baseline.map(t=>{const budget=roleMinuteBudget(t.players.map(p=>p.rawMinutes));return {...t,players:t.players.map((p,i)=>({...p,minutes:budget[i],roleMinutes:p.rawMinutes,minuteSd:roleMinuteSd(state.history.get(p.numericId)||[])}))};});tasks.push({game:g,actual,baseline:{...scenario,teams:baseline},candidate:{...scenario,rotationMode:'role-budget-research-1',teams:joint}});}
   }else if(baseline||candidate)skipped('fewer than six eligible prior-roster players');
  }
 }
 if(actual)pending.push(actual);if(++processed%1500===0)console.log('Chronological games processed: '+processed);
}


const metrics={baseline:{all:newErrorAccumulator(),active:newErrorAccumulator(),covered:0,minuteCovered:0,brier:0},role:{all:newErrorAccumulator(),active:newErrorAccumulator(),covered:0,minuteCovered:0,brier:0}},pairedMinutes=[],pairedPoints=[],foldMetrics=new Map();let n=0,activeN=0;
for(const [i,task] of tasks.entries()){
 const actual=new Map(task.actual.map(p=>['espn:player:'+p.playerId,p])),errors={};if(!foldMetrics.has(task.game.season))foldMetrics.set(task.game.season,{baseline:newErrorAccumulator(),role:newErrorAccumulator()});
 for(const [key,scenario] of [['baseline',task.baseline],['role',task.candidate]]){const result=simulate(scenario,{seed:(protocol.seed+task.game.id)>>>0}),m=metrics[key];errors[key]=new Map();
  for(const p of result.players){const a=actual.get(p.id);if(!a)continue;const values=Object.fromEntries(['minutes','points','rebounds','assists'].map(k=>[k,p[k].mean]));addPlayerError(m.all,values,a);m.brier+=(p.appearanceProbability-Number(a.minutes>0))**2;if(key==='baseline')n++;
   if(a.minutes>0){if(!Number.isFinite(p.conditional.minutes.mean))throw new Error('Unsupported positive appearance');const conditional=Object.fromEntries(['minutes','points','rebounds','assists'].map(k=>[k,p.conditional[k].mean]));addPlayerError(m.active,conditional,a);addPlayerError(foldMetrics.get(task.game.season)[key],conditional,a);m.covered+=Number(a.points>=p.conditional.points.p10&&a.points<=p.conditional.points.p90);m.minuteCovered+=Number(a.minutes>=p.conditional.minutes.p10&&a.minutes<=p.conditional.minutes.p90);errors[key].set(p.id,{minutes:Math.abs(conditional.minutes-a.minutes),points:Math.abs(conditional.points-a.points)});if(key==='baseline')activeN++;}
  }
 }
 for(const [id,e] of errors.baseline){const c=errors.role.get(id);if(!c)throw new Error('Paired cohort mismatch');pairedMinutes.push({date:task.game.datetime.slice(0,10),difference:c.minutes-e.minutes});pairedPoints.push({date:task.game.datetime.slice(0,10),difference:c.points-e.points});}
 console.log('Role minute budget '+(i+1)+'/'+tasks.length);
}
const models=Object.fromEntries(Object.entries(metrics).map(([k,m])=>[k,{all:finishErrors(m.all),ifPlaying:finishErrors(m.active),participationBrier:m.brier/n,pointsCoverage80:m.covered/activeN,minutesCoverage80:m.minuteCovered/activeN}]));
const artifact={version:'role-budget-research-1',generatedAt:new Date().toISOString(),games:tasks.length,listedPlayers:n,playingPlayers:activeN,protocol:{...protocol,candidate:'Equal absolute correction of raw role minute targets to a 240-minute team budget; individual targets 0–48; SD shrunk from earlier positive-minute histories to a six-minute prior, bounded 4–12',status:'Fixed candidate; previously inspected seasons, proxy rosters; no untouched claim'},models,folds:[...foldMetrics].map(([season,m])=>({season,baseline:finishErrors(m.baseline),role:finishErrors(m.role)})),uncertainty:{minutes:pairedAllocationBootstrap(pairedMinutes),points:pairedAllocationBootstrap(pairedPoints)},deployment:{enabled:true,modelVersion:'trained-opponent-rest-role-budget-1',scope:'Newly prepared inputs only; independent live validation and prop calibration pending'},sourceHashes:{games:createHash('sha256').update(gameRaw).digest('hex'),players:createHash('sha256').update(playerRaw).digest('hex')},codeHashes:Object.fromEntries(await Promise.all(['src/model.js','src/rotation-minutes.js','src/allocation-replay.js','scripts/research-minutes.js'].map(async p=>[p,createHash('sha256').update(await read(p)).digest('hex')]))),promotion:{passed:false,reason:'Candidate must improve conditional minutes without worsening conditional points; proxy-roster audit alone cannot validate complete current rosters or prop calibration.'}};
artifact.uncertainty.minutes.method=artifact.uncertainty.minutes.method.replace('point absolute error','minute absolute error');
artifact.promotion.retrospectiveMinutesImproves=models.role.ifPlaying.mae.minutes<models.baseline.ifPlaying.mae.minutes;artifact.promotion.retrospectivePointsImproves=models.role.ifPlaying.mae.points<=models.baseline.ifPlaying.mae.points;
await fs.writeFile(new URL('minutes-research-artifact.json',root),JSON.stringify(artifact,null,2));console.log(JSON.stringify({models,promotion:artifact.promotion},null,2));
