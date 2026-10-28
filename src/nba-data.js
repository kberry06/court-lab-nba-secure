import {assert, timestamp, string, validateScenario} from './validation.js';
import {buildGameForecast,playerArtifact,TRAINED_MODEL_VERSION} from './trained-forecast.js';
import {estimatePlayer} from './player-estimator.js';
import {roleMinuteBudget,roleMinuteSd} from './rotation-minutes.js';

const day=86400000;
const id=(kind,value)=>`espn:${kind}:${value}`;
const name=t=>t.full_name||t.name;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const final=g=>g.status_state==='final'||(!g.status_state&&g.status==='Final');
const start=g=>g.datetime||null;
const minutes=value=>{const [m,s=0]=String(value??'0').split(':').map(Number);return m+s/60;};
const average=values=>values.reduce((a,b)=>a+b,0)/values.length;
const weightedAverage=(rows,value,cutoff,halfLifeDays=120,priorValue=0,priorWeight=0)=>{
  let total=priorValue*priorWeight,weight=priorWeight;
  for(const row of rows){const at=Date.parse(row.datetime||`${row.date}T12:00:00Z`),w=2**(-Math.max(0,cutoff-at)/(halfLifeDays*day));total+=value(row)*w;weight+=w;}
  return total/weight;
};
function normalizeRotation(players) {
  const target=240,mins=players.map(p=>p.minutes),open=new Set(players.map((_,i)=>i));let fixed=0;
  while(open.size){const raw=[...open].reduce((n,i)=>n+mins[i],0),space=target-fixed;if(raw<=0){for(const i of open)mins[i]=space/open.size;break;}const capped=[...open].filter(i=>space*mins[i]/raw>48);if(!capped.length){for(const i of open)mins[i]=space*mins[i]/raw;break;}for(const i of capped){mins[i]=48;fixed+=48;open.delete(i);}}
  return players.map((p,i)=>({...p,minutes:mins[i]}));
}
const cleanId=value=>{assert(Number.isSafeInteger(Number(value))&&Number(value)>0,'Invalid provider identifier');return Number(value);};

export function validateBundle(b,now=Date.now()) {
  assert(b&&b.provider==='espn','Expected an ESPN public-data bundle');
  timestamp(b.fetchedAt,'data observation time');assert(Date.parse(b.fetchedAt)<=now+60000,'Observation time is in the future');
  string(b.rightsBasis,'data permission basis');
  for(const key of ['games','players','injuries','stats'])assert(Array.isArray(b[key])&&b[key].length<=5000,`Invalid ${key} array (maximum 5000)`);
  const ids=new Set();for(const g of b.games){cleanId(g.id);assert(!ids.has(g.id),'Duplicate game');ids.add(g.id);cleanId(g.home_team?.id);cleanId(g.visitor_team?.id);string(name(g.home_team),'home team');string(name(g.visitor_team),'away team');if(g.datetime)timestamp(g.datetime,'tip-off');}
  ids.clear();for(const p of b.players){cleanId(p.id);assert(!ids.has(p.id),'Duplicate player');ids.add(p.id);cleanId(p.team?.id);string(`${p.first_name} ${p.last_name}`,'player name');}
  return b;
}

export function buildScenario(bundle,gameId,now=Date.now(),{roleBudget=true}={}) {
  validateBundle(bundle,now);const g=bundle.games.find(g=>String(g.id)===String(gameId));assert(g,'Game not found');
  assert(start(g)&&Date.parse(start(g))>now,'Predictions require a confirmed future tip-off');
  assert(!g.postponed&&!['final','in_progress','postponed','canceled','suspended','abandoned','unknown'].includes(g.status_state),'Game is not available for a pregame prediction');
  assert(now-Date.parse(bundle.fetchedAt)<24*3600000,'Refresh roster and injury data before predicting (older than 24 hours)');
  const cutoff=Date.parse(bundle.fetchedAt),playerModelEligible=playerArtifact.promotion.passed&&Date.parse(playerArtifact.trainingLastGameAt)+day<cutoff,warnings=['Recent-score game baseline. Player estimates are historically fitted where the training cutoff permits; live prospective validation is pending. Injury probabilities and player impacts are assumptions; confirm lineups.'];
  const teams=[g.home_team,g.visitor_team].map(t=>{
    const history=bundle.games.filter(x=>x.id!==g.id&&final(x)&&Date.parse(x.datetime||`${x.date}T23:59:59Z`)<cutoff-day&&(x.home_team.id===t.id||x.visitor_team.id===t.id)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
    assert(history.length>=5,`${name(t)} needs at least five completed historical games`);
    const historicalIds=new Set(bundle.games.filter(x=>final(x)&&Date.parse(x.datetime||`${x.date}T23:59:59Z`)<cutoff-day).map(x=>x.id));
    const roster=bundle.players.filter(p=>p.team.id===t.id);assert(roster.length>=6,`${name(t)} roster is missing`);
    let priorModeled=[];
    const players=roster.map(p=>{
      const unique=new Map();for(const s of bundle.stats)if(s.player?.id===p.id&&(historicalIds.has(s.game?.id)||(s.provenance==='espn-player-gamelog'&&s.game?.final&&Date.parse(s.game.datetime)<cutoff-day))&&minutes(s.min)>0)unique.set(s.game.id,s);
      const rows=[...unique.values()].sort((a,b)=>b.game.date.localeCompare(a.game.date)).slice(0,20);
      for(const r of rows)assert(Number.isFinite(minutes(r.min))&&minutes(r.min)<=80&&['pts','reb','ast'].every(k=>Number.isFinite(r[k])&&r[k]>=0),'Invalid historical player statistics');
      const totalMinutes=rows.reduce((n,r)=>n+minutes(r.min),0);
      const injury=bundle.injuries.find(i=>i.player?.id===p.id);const status=injury?.status||'Not listed';
      const availability={out:0,doubtful:.25,questionable:.5,probable:.9,'day-to-day':.5}[status.toLowerCase()]??(injury?.status? .5:1);
      const recent=rows.slice(0,10).map(r=>({gameId:r.game.id,date:r.game.date,opponent:r.opponent?.abbreviation||r.opponent?.name||'Opponent',points:r.pts,rebounds:r.reb,assists:r.ast}));
      if(rows.length<3)priorModeled.push(`${p.first_name} ${p.last_name}`);
      const priorMinutes=rows.length?12:6,roleMinutes=rows.length?average(rows.map(r=>minutes(r.min))):priorMinutes;
      const priorPossessions=rows.length<3?120:0,denominator=totalMinutes+priorPossessions;
      const estimated=playerModelEligible?estimatePlayer(rows.map(r=>({minutes:minutes(r.min),points:r.pts,rebounds:r.reb,assists:r.ast})),playerArtifact.parameters):{minutes:roleMinutes,points:(rows.reduce((n,r)=>n+r.pts,0)+.45*priorPossessions)/denominator,rebounds:(rows.reduce((n,r)=>n+r.reb,0)+.15*priorPossessions)/denominator,assists:(rows.reduce((n,r)=>n+r.ast,0)+.10*priorPossessions)/denominator};
      const {points,rebounds,assists}=estimated;
      return {id:id('player',p.id),name:`${p.first_name} ${p.last_name}`,position:p.position,minutes:clamp(estimated.minutes,0,48),roleMinutes:clamp(estimated.minutes,0,48),minuteSd:roleMinuteSd(rows.map(r=>({minutes:minutes(r.min)}))),availability,impact:clamp((points-.45)*12+(assists-.1)*8,-4,8),points:clamp(points,.01,2),rebounds:clamp(rebounds,0,2),assists:clamp(assists,0,2),sampleGames:rows.length,priorModeled:rows.length<3,injury:status,recent};
    }).sort((a,b)=>b.minutes-a.minutes).slice(0,20);
    const budget=roleBudget?roleMinuteBudget(players.map(p=>p.roleMinutes)):null,rotation=roleBudget?players.map((p,i)=>({...p,minutes:budget[i]})):normalizeRotation(players);
    assert(rotation.filter(p=>p.availability>0).length>=6,`${name(t)} needs six eligible roster players`);
    if(priorModeled.length)warnings.push(`${name(t)}: limited history for ${priorModeled.join(', ')}. Their rates are shrunk toward conservative NBA priors; review rotation minutes.`);
    if(cutoff-Date.parse(history[0].datetime||history[0].date)>45*day)warnings.push(`${name(t)} history ends ${history[0].date}; offseason changes may weaken these estimates.`);
    const scored=history.map(x=>x.home_team.id===t.id?x.home_team_score:x.visitor_team_score),allowed=history.map(x=>x.home_team.id===t.id?x.visitor_team_score:x.home_team_score);
    assert([...scored,...allowed].every(n=>Number.isFinite(n)&&n>0&&n<250),'Invalid historical game scores');
    return {id:id('team',t.id),name:name(t),pace:100,offense:clamp(weightedAverage(history,x=>x.home_team.id===t.id?x.home_team_score:x.visitor_team_score,cutoff,120,114,8),80,140),defense:clamp(weightedAverage(history,x=>x.home_team.id===t.id?x.visitor_team_score:x.home_team_score,cutoff,120,114,8),80,140),restDays:clamp(Math.floor((Date.parse(g.datetime)-Date.parse(history[0].datetime||history[0].date))/day)-1,0,10),players:rotation,sampleGames:history.length,ratingMethod:'time-decay-120d-prior8'};
  });
  const gameForecast=buildGameForecast(bundle,g);
  if(gameForecast)warnings[0]='Historically trained opponent/rest game model and recency-weighted player estimates. Live prospective validation is pending. Injury probabilities, player impacts, minute reallocation and player-prop distributions remain assumptions; confirm lineups.';
  else warnings.push('Trained game forecast unavailable for these inputs; the recent-score game baseline is retained.');
  if(roleBudget)warnings.push('Role-based team minute budget with history-based minute uncertainty. Recent allocations improve in reused historical research; live improvement and prop calibration remain unestablished.');
  return validateScenario({id:id('game',g.id),source:gameForecast?'ESPN public data · trained opponent/rest model':'ESPN public data · recent-game baseline',demo:false,asOf:bundle.fetchedAt,start:g.datetime,teams,warnings,gameForecast,...(roleBudget?{rotationMode:'role-budget-1'}:{}),playerEstimatorVersion:playerModelEligible?playerArtifact.modelVersion:null});
}

export function scheduleView(bundle,store,now=Date.now()) {
  if(!bundle)return {games:[],fetchedAt:null};
  return {fetchedAt:bundle.fetchedAt,stale:now-Date.parse(bundle.fetchedAt)>6*3600000,games:bundle.games.map(g=>{const eventId=id('game',g.id),run=store.latestRun?.(eventId);return {id:eventId,providerId:g.id,start:start(g),date:g.date,status:g.status_state||g.status,home:name(g.home_team),away:name(g.visitor_team),homeId:g.home_team.id,awayId:g.visitor_team.id,homeScore:g.home_team_score,awayScore:g.visitor_team_score,ready:!!store.scenario(eventId),projection:run?{runId:run.id,generatedAt:run.summary.generatedAt,home:run.summary.home.mean,away:run.summary.away.mean,homeWin:run.summary.homeWin,total:run.summary.total.mean,modelVersion:run.summary.modelVersion,needsRefresh:store.scenario(eventId)?.rotationMode!=='role-budget-1'||![TRAINED_MODEL_VERSION,'recent-game-role-budget-1'].includes(run.summary.modelVersion)}:null};}).sort((a,b)=>(a.start||a.date).localeCompare(b.start||b.date))};
}
