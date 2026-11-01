// One serial collector on the existing single-instance service. SQLite receipts
// survive restarts; missed pregame observations are never reconstructed later.
export function forecastCollector({store,nba,prepare,canPrepare=()=>true,clock=Date.now,candidateVersion='minute-shadow-balanced-1'}) {
 let running=false;
 const key='forecast-collector:v1', status=()=>store.cache(key)?.body||{state:'not started'};
 const save=value=>store.saveCache(key,value);
 async function tick(){
  if(running)return {state:'busy'};running=true;
  const startedAt=new Date(clock()).toISOString(), previous=status();
  save({...previous,state:'running',startedAt});
  try {
   const bundle=await nba.schedule();store.settleGames(bundle.games);
   const upcoming=bundle.games.filter(g=>g.status_state==='scheduled'&&Date.parse(g.datetime)>clock()+5*60000&&Date.parse(g.datetime)<=clock()+24*3600000).sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime));
   const captures=[];
   for(const game of upcoming){
    const phase=Date.parse(game.datetime)-clock()<=90*60000?'near-tip':'early',receiptKey='auto-capture:v3:'+candidateVersion+':'+game.id+':'+phase,receipt=store.cache(receiptKey)?.body;
    if(receipt?.state==='saved'||receipt?.lastAttemptAt&&clock()-Date.parse(receipt.lastAttemptAt)<15*60000)continue;
    if(!canPrepare())break;
    const lastAttemptAt=new Date(clock()).toISOString();
    store.saveCache(receiptKey,{state:'running',lastAttemptAt});
    try{const result=await prepare(game);const state=result.shadow?.state==='saved'?'saved':'retry';store.saveCache(receiptKey,{...result,state,lastAttemptAt});captures.push({gameId:game.id,state});}
    catch{store.saveCache(receiptKey,{state:'retry',lastAttemptAt,reason:'Input retrieval or calculation failed; retry after 15 minutes'});captures.push({gameId:game.id,state:'retry'});}
   }
   const ids=[...new Set([...store.pendingPerformanceEvents(clock()),...store.pendingMatchedEvents()])].slice(0,8),settlements=[];
   for(const eventId of ids){const retryKey='auto-settle:v1:'+eventId,last=store.cache(retryKey)?.body;if(last&&clock()-Date.parse(last.at)<30*60000)continue;
    try{await nba.settle(eventId);settlements.push({eventId,state:'settled'});}catch{settlements.push({eventId,state:'unresolved'});}store.saveCache(retryKey,{at:new Date(clock()).toISOString()});
   }
   const missing=upcoming.filter(g=>store.cache('auto-capture:v3:'+candidateVersion+':'+g.id+':'+(Date.parse(g.datetime)-clock()<=90*60000?'near-tip':'early'))?.body.state!=='saved').map(g=>({gameId:g.id,start:g.datetime,reason:Date.parse(g.datetime)-clock()<90*60000?'Pregame comparison missing near tip-off':'Awaiting capture'}));
   const captured=new Set(store.shadowCapturedEvents(candidateVersion));
   const missed=bundle.games.filter(g=>Date.parse(g.datetime)<=clock()+5*60000&&Date.parse(g.datetime)>clock()-24*3600000&&!captured.has('espn:game:'+g.id)).map(g=>({gameId:g.id,start:g.datetime,reason:'No saved pregame shadow comparison; will not reconstruct'}));
   const result={state:'complete',missed,startedAt,completedAt:new Date(clock()).toISOString(),lastSuccessAt:new Date(clock()).toISOString(),captures,settlements,missing,upcoming:upcoming.length};save(result);return result;
  }catch{const result={...previous,state:'failed',startedAt,completedAt:new Date(clock()).toISOString(),reason:'Public schedule unavailable; saved forecasts retained'};save(result);return result;}finally{running=false;}
 }
 function start(){const check=async()=>{const r=await tick();console.info('Forecast collection',JSON.stringify({state:r.state,captured:r.captures?.filter(c=>c.state==='saved').length||0,retries:r.captures?.filter(c=>c.state==='retry').length||0,missing:r.missing?.length||0,missed:r.missed?.length||0,settled:r.settlements?.filter(s=>s.state==='settled').length||0}));};const first=setTimeout(()=>void check(),15000),timer=setInterval(()=>void check(),5*60000);first.unref();timer.unref();return ()=>{clearTimeout(first);clearInterval(timer);};}
 return {tick,start,status};
}
