const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sigmoid=x=>1/(1+Math.exp(-x));
const logLoss=(p,y)=>-(y*Math.log(clamp(p,1e-9,1-1e-9))+(1-y)*Math.log(clamp(1-p,1e-9,1-1e-9)));
const initial=()=>({elo:1500,off:114,def:114,games:0});
const stateFor=(states,id)=>{if(!states.has(id))states.set(id,initial());return states.get(id);};
function wilson(successes,n){if(!n)return null;const p=successes/n,z=1.96,denominator=1+z*z/n,center=(p+z*z/(2*n))/denominator,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/denominator;return [center-half,center+half];}
function probabilityMetrics(rows){const {marginMae,totalMae,...m}=metrics(rows);return m;}

export function replayHistory(games,{decay=.88,k=18,homeElo=48,eloMarginWeight=.032,probabilityScale=7.7}={}) {
  const states=new Map(),rows=[];let season=null;
  for(const g of [...games].sort((a,b)=>a.datetime.localeCompare(b.datetime)||a.id-b.id)) {
    if(g.season!==season) {
      if(season!==null)for(const s of states.values()){s.elo=1500+.67*(s.elo-1500);s.off=114+.55*(s.off-114);s.def=114+.55*(s.def-114);s.games=0;}
      season=g.season;
    }
    const h=stateFor(states,g.home_team.id),a=stateFor(states,g.visitor_team.id);
    const scoreMargin=(h.off+a.def-a.off-h.def)/2+(g.neutralSite?0:2.2);
    const eloMargin=(h.elo-a.elo+(g.neutralSite?0:homeElo))*eloMarginWeight;
    const expectedMargin=.62*scoreMargin+.38*eloMargin;
    const expectedTotal=h.off+a.off+(h.def+a.def-228)/2;
    const probability=sigmoid(expectedMargin/probabilityScale);
    const expectedElo=sigmoid((h.elo-a.elo+(g.neutralSite?0:homeElo))/400*Math.log(10));
    const actualMargin=g.home_team_score-g.visitor_team_score,y=actualMargin>0?1:0;
    rows.push({id:g.id,season:g.season,datetime:g.datetime,homeTeamId:g.home_team.id,awayTeamId:g.visitor_team.id,probability,eloProbability:expectedElo,expectedMargin,expectedTotal,actualMargin,actualTotal:g.home_team_score+g.visitor_team_score,y});
    const winnerDifference=(y?1:-1)*(h.elo-a.elo);
    const mov=Math.log(Math.abs(actualMargin)+1)*(2.2/(winnerDifference*.001+2.2));
    h.elo+=k*mov*(y-expectedElo);a.elo-=k*mov*(y-expectedElo);
    const alpha=1-decay;
    h.off=decay*h.off+alpha*g.home_team_score;h.def=decay*h.def+alpha*g.visitor_team_score;
    a.off=decay*a.off+alpha*g.visitor_team_score;a.def=decay*a.def+alpha*g.home_team_score;h.games++;a.games++;
  }
  return {rows,teamRatings:Object.fromEntries([...states].map(([id,s])=>[id,s]))};
}

export function metrics(rows) {
  if(!rows.length)return null;
  const avg=f=>rows.reduce((n,r)=>n+f(r),0)/rows.length;
  const bins=Array.from({length:10},(_,i)=>{const x=rows.filter(r=>Math.min(9,Math.floor(r.probability*10))===i);return {from:i/10,to:(i+1)/10,count:x.length,predicted:x.length?x.reduce((n,r)=>n+r.probability,0)/x.length:null,actual:x.length?x.reduce((n,r)=>n+r.y,0)/x.length:null};});
  const confident=[.7,.8,.85,.9].map(threshold=>{const selected=rows.filter(r=>Math.max(r.probability,1-r.probability)>=threshold),wins=selected.reduce((n,r)=>n+((r.probability>=.5)===Boolean(r.y)?1:0),0);return {threshold,games:selected.length,coverage:selected.length/rows.length,accuracy:selected.length?wins/selected.length:null,wilson95: wilson(wins,selected.length)};});
  return {games:rows.length,accuracy:avg(r=>((r.probability>=.5)===Boolean(r.y)?1:0)),brier:avg(r=>(r.probability-r.y)**2),logLoss:avg(r=>logLoss(r.probability,r.y)),marginMae:avg(r=>Math.abs(r.expectedMargin-r.actualMargin)),totalMae:avg(r=>Math.abs(r.expectedTotal-r.actualTotal)),calibration:bins,confidenceCoverage:confident};
}

export function walkForward(games,firstEvaluationSeason=2020) {
  const seasons=[...new Set(games.map(g=>g.season))].sort(),candidates=[];
  for(const decay of [.84,.88,.92])for(const k of [14,18,22])for(const probabilityScale of [6.8,7.7,8.6])candidates.push({decay,k,probabilityScale});
  const folds=[],heldOut=[],baselineRows=[];
  for(const target of seasons.filter(s=>s>=firstEvaluationSeason)) {
    const available=games.filter(g=>g.season<=target),trainingSeasons=seasons.filter(s=>s<target);let selected=candidates[0],best=Infinity;
    for(const c of candidates){const r=replayHistory(available,c).rows.filter(x=>trainingSeasons.includes(x.season)),m=metrics(r);if(m&&m.logLoss<best){best=m.logLoss;selected=c;}}
    const testRows=replayHistory(available,selected).rows.filter(r=>r.season===target);
    const priorRows=replayHistory(available,selected).rows.filter(r=>r.season<target),homeFrequency=priorRows.reduce((n,r)=>n+r.y,0)/priorRows.length;
    heldOut.push(...testRows);baselineRows.push(...testRows.map(r=>({...r,probability:homeFrequency})));
    folds.push({season:target,trainingSeasons,parameters:selected,metrics:metrics(testRows),homeFrequencyBaseline:probabilityMetrics(testRows.map(r=>({...r,probability:homeFrequency})))});
  }
  const finalParameters=folds.at(-1)?.parameters||candidates[0],finalReplay=replayHistory(games,finalParameters);
  const fixedEloRows=replayHistory(games,{k:18}).rows.filter(r=>r.season>=firstEvaluationSeason).map(r=>({...r,probability:r.eloProbability}));
  return {method:'expanding-window season replay; parameters selected only on prior seasons',warmupSeason:seasons[0],folds,aggregate:metrics(heldOut),homeFrequencyBaseline:probabilityMetrics(baselineRows),fixedEloBaseline:probabilityMetrics(fixedEloRows),heldOutPredictions:heldOut,finalParameters,teamRatings:finalReplay.teamRatings};
}
