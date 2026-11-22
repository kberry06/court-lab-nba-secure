// One serial collector on the existing single-instance service. SQLite receipts
// survive restarts; missed pregame observations are never reconstructed later.
export function forecastCollector({store,nba,prepare,canPrepare=()=>true,clock=Date.now,candidateVersion='minute-shadow-balanced-1',additionalCaptureVersions=[]}) {
 let running=false,volatileStatus=null;
 const captureVersion=[candidateVersion,...additionalCaptureVersions].join(':');
 const finalKey=(games,target)=>games.filter(g=>g.status_state==='final'&&Date.parse(g.datetime)<clock()&&[g.home_team?.id,g.visitor_team?.id].some(id=>id!=null&&[target.home_team?.id,target.visitor_team?.id].includes(id))).map(g=>g.id).sort((a,b)=>a-b).join(',');
 const key='forecast-collector:v1', status=()=>{try{return volatileStatus||store.cache(key)?.body||{state:'not started'};}catch{return volatileStatus||{state:'failed',reason:'Storage unavailable'};}};
 const save=value=>{volatileStatus=value;return store.saveCache(key,value);};
 async function tick(){
  if(running)return {state:'busy'};running=true;
  const startedAt=new Date(clock()).toISOString(), previous=status();
  try {
   save({...previous,state:'running',startedAt});
   const bundle=await nba.schedule();store.settleGames(bundle.games);
   const upcoming=bundle.games.filter(g=>g.status_state==='scheduled'&&Date.parse(g.datetime)>clock()+5*60000&&Date.parse(g.datetime)<=clock()+24*3600000).sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime));
   const captures=[];
   for(const game of upcoming){
    const phase=Date.parse(game.datetime)-clock()<=90*60000?'near-tip':'early',receiptKey='auto-capture:v3:'+captureVersion+':'+game.id+':'+phase,receipt=store.cache(receiptKey)?.body;
    const latestFinals=finalKey(bundle.games,game),changed=receipt?.latestFinals!==latestFinals;
    if(receipt?.state==='saved'&&!changed||!changed&&receipt?.lastAttemptAt&&clock()-Date.parse(receipt.lastAttemptAt)<15*60000)continue;
    if(!canPrepare())break;
    const lastAttemptAt=new Date(clock()).toISOString();
    store.saveCache(receiptKey,{state:'running',lastAttemptAt,latestFinals});
    try{const result=await prepare(game);const state=result.shadow?.state==='saved'&&additionalCaptureVersions.every(v=>result.shadow.versionsSaved?.includes(v))?'saved':'retry';store.saveCache(receiptKey,{...result,state,lastAttemptAt,latestFinals});captures.push({gameId:game.id,state});}
    catch{store.saveCache(receiptKey,{state:'retry',lastAttemptAt,latestFinals,reason:'Input retrieval or calculation failed; retry after 15 minutes'});captures.push({gameId:game.id,state:'retry'});}
   }
   const ids=[...new Set([...store.pendingPerformanceEvents(clock()),...store.pendingMatchedEvents()])].slice(0,8),settlements=[];
   for(const eventId of ids){const retryKey='auto-settle:v1:'+eventId,last=store.cache(retryKey)?.body;if(last&&clock()-Date.parse(last.at)<30*60000)continue;
    try{await nba.settle(eventId);settlements.push({eventId,state:'settled'});}catch{settlements.push({eventId,state:'unresolved'});}store.saveCache(retryKey,{at:new Date(clock()).toISOString()});
   }
   const missing=upcoming.filter(g=>store.cache('auto-capture:v3:'+captureVersion+':'+g.id+':'+(Date.parse(g.datetime)-clock()<=90*60000?'near-tip':'early'))?.body.state!=='saved').map(g=>({gameId:g.id,start:g.datetime,reason:Date.parse(g.datetime)-clock()<90*60000?'Pregame comparison missing near tip-off':'Awaiting capture'}));
   const captured=new Set(store.shadowCapturedEvents(candidateVersion));
   const missed=bundle.games.filter(g=>Date.parse(g.datetime)<=clock()+5*60000&&Date.parse(g.datetime)>clock()-24*3600000&&!captured.has('espn:game:'+g.id)).map(g=>({gameId:g.id,start:g.datetime,reason:'No saved pregame shadow comparison; will not reconstruct'}));
   const result={state:'complete',missed,startedAt,completedAt:new Date(clock()).toISOString(),lastSuccessAt:new Date(clock()).toISOString(),captures,settlements,missing,upcoming:upcoming.length};save(result);return result;
  }catch(error){const storageError=error.errcode===13||error.code==='ENOSPC'||String(error.code||'').startsWith('ERR_SQLITE');const result={...previous,state:'failed',startedAt,completedAt:new Date(clock()).toISOString(),reason:storageError?'Storage unavailable; collection paused. Saved forecasts retained.':'Public schedule unavailable; saved forecasts retained'};try{save(result);}catch{volatileStatus=result;}return result;}finally{running=false;}
 }
 function start(){const check=async()=>{let r;try{r=await tick();}catch{r={state:'failed'};console.error('Forecast collector failed safely; web service retained');}console.info('Forecast collection',JSON.stringify({state:r.state,captured:r.captures?.filter(c=>c.state==='saved').length||0,retries:r.captures?.filter(c=>c.state==='retry').length||0,missing:r.missing?.length||0,missed:r.missed?.length||0,settled:r.settlements?.filter(s=>s.state==='settled').length||0}));};const first=setTimeout(()=>void check(),15000),timer=setInterval(()=>void check(),5*60000);first.unref();timer.unref();return ()=>{clearTimeout(first);clearInterval(timer);};}
 return {tick,start,status};
}
