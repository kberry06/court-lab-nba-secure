import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {timingSafeEqual,createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {openStore} from './store.js';
import {validateScenario,assert,string,number} from './validation.js';
import {normalizeQuote,priceQuote,addNoVig,fetchApprovedOdds} from './odds.js';
import {demoScenario,demoHistory} from './demo.js';
import {mapProviderEvents,registerExactMatches} from './adapter.js';
import {publicNba} from './public-nba.js';
import {buildScenario,scheduleView,validateBundle} from './nba-data.js';
import {sessionAuth,verifyPassword,validHash,hashPassword} from './auth.js';
import {gameArtifact,playerArtifact,TRAINED_MODEL_VERSION} from './trained-forecast.js';
const root=fileURLToPath(new URL('../public/',import.meta.url));
export function createApp({dataDir=process.env.DATA_DIR||'data',adminToken=process.env.ADMIN_TOKEN,passwordHash=process.env.APP_PASSWORD_HASH,password=process.env.APP_PASSWORD,username=process.env.APP_USERNAME||'admin',production=process.env.NODE_ENV==='production',basePath=''}={}) {
 if(!/^(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath))throw new Error('Invalid base path');
 const renderFile=async name=>{let data=await readFile(resolve(root,name));if(name.endsWith('.html'))data=Buffer.from(data.toString().replace('<html ',`<html data-base="${basePath}" `).replace(/(href|src)="\//g,`$1="${basePath}/`));return data;};
 if(production&&(!adminToken||adminToken.length<24))throw new Error('Production ADMIN_TOKEN must be at least 24 characters');
 if(!passwordHash&&password){if(typeof password!=='string'||password.length<24||password.length>1024)throw new Error('APP_PASSWORD must contain 24–1024 characters');passwordHash=hashPassword(password);}
 if(production&&!validHash(passwordHash))throw new Error('Production APP_PASSWORD_HASH must be a valid scrypt hash');
 const store=openStore(dataDir);if(!store.scenarios().length)store.saveScenario(demoScenario());let busy=false;
 const nba=publicNba(store);let dataJob={state:'idle'},scheduleBusy=false;
 const counters=new Map(),loginAttempts=new Map(),auth=sessionAuth(store.db,passwordHash,production,basePath);
 const work=(data)=>new Promise((resolve,reject)=>{if(busy){const e=new Error('A calculation is running. Try again shortly.');e.status=429;reject(e);return;}busy=true;const w=new Worker(new URL('./worker.js',import.meta.url),{workerData:data});const timer=setTimeout(()=>{w.terminate();},60000);w.once('message',m=>m.error?reject(Object.assign(new Error(m.error),{status:400})):resolve(m.result));w.once('error',reject);w.once('exit',code=>{clearTimeout(timer);busy=false;if(code)reject(new Error('Calculation interrupted'));});});
 const project=async(scenario,seed=42)=>{validateScenario(scenario);number(seed,0,4294967295,'seed');const sim=await work({kind:'simulation',scenario,seed});const quotes=addNoVig(store.quotes(scenario.id).map(q=>priceQuote(q,sim,scenario)));const {samples,...summary}=sim;store.freezeForecast(scenario,summary);const histogram=Array.from({length:20},(_,i)=>({lower:-50+i*5,count:samples.margin.filter(m=>i===0?m< -45:i===19?m>=45:m>=-50+i*5&&m< -45+i*5).length}));const id=store.record('runs',{scenario,summary,histogram,quotes},scenario.id);return {...summary,id,histogram,quotes};};
 const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
 try {
  const url=new URL(req.url,'http://localhost');
  if(basePath&&url.pathname===basePath){res.writeHead(308,{Location:basePath+'/'});res.end();return;}
  if(basePath&&!url.pathname.startsWith(basePath+'/')){send(res,404,{error:'Not found'});return;}
  const path=url.pathname.slice(basePath.length)||'/';
  if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  const loggedIn=auth.get(req);
  const publicFiles={'/login':'login.html','/login.js':'login.js','/style.css':'style.css'};
  if(req.method==='GET'&&publicFiles[path]){const data=await renderFile(publicFiles[path]);res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store'});res.end(data);return;}
  if(req.method==='GET'&&passwordHash&&!loggedIn&&path!=='/api/health'){if(path.startsWith('/api/'))send(res,401,{error:'Sign in required'});else{res.writeHead(302,{Location:basePath+'/login','Cache-Control':'no-store'});res.end();}return;}
  if(req.method==='POST'){
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){send(res,403,{error:'Cross-origin writes rejected'});return;}
   const ip=req.socket.remoteAddress,now=Date.now();let rate=counters.get(ip);if(!rate||now-rate.at>60000){rate={at:now,n:0};counters.set(ip,rate);}if(++rate.n>30){send(res,429,{error:'Rate limit: 30 writes per minute'});return;}if(counters.size>10000)counters.clear();
   if(path!=='/auth/login'&&!loggedIn&&(adminToken||passwordHash)){const actual=createHash('sha256').update(req.headers.authorization||'').digest(),expected=createHash('sha256').update(`Bearer ${adminToken}`).digest();if(!adminToken||!timingSafeEqual(actual,expected)){send(res,401,{error:'Sign in or provide an admin token'});return;}}
   assert((req.headers['content-type']||'').startsWith('application/json'),'JSON content type required');
   let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>5*1024*1024){send(res,413,{error:'Maximum import is 5 MB'});return;}chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{assert(false,'Invalid JSON');}
   if(path==='/auth/login'){const at=Date.now(),attempt=loginAttempts.get(ip)||{at,n:0};if(at-attempt.at>15*60000){attempt.at=at;attempt.n=0;}loginAttempts.set(ip,attempt);if(++attempt.n>5){send(res,429,{error:'Too many sign-in attempts. Try again in 15 minutes.'});return;}const passwordOk=verifyPassword(body.password,passwordHash);if(!passwordOk||body.username!==username){send(res,401,{error:'Invalid username or password'});return;}loginAttempts.delete(ip);res.setHeader('Set-Cookie',auth.create());send(res,200,{ok:true});return;}
   if(path==='/auth/logout'){res.setHeader('Set-Cookie',auth.clear(req));send(res,200,{ok:true});return;}
   if(path==='/api/nba/refresh'){assert(!scheduleBusy,'A schedule refresh is already running');scheduleBusy=true;try{const bundle=await nba.schedule(true);store.settleGames(bundle.games);send(res,200,scheduleView(bundle,store));}finally{scheduleBusy=false;}return;}
   if(path==='/api/nba/import'){validateBundle(body);store.saveCache('nba-schedule',body);send(res,201,scheduleView(body,store));return;}
   if(path==='/api/nba/prepare'){
    assert(dataJob.state!=='running','Another matchup is loading');const game=store.cache('nba-schedule')?.body.games.find(g=>String(g.id)===String(body.gameId));assert(game,'Refresh the schedule and select a game');assert(game.datetime&&Date.parse(game.datetime)>Date.now(),'Select an upcoming game with a confirmed tip-off');
    dataJob={state:'running',gameId:game.id,startedAt:new Date().toISOString()};
    (async()=>{try{const bundle=await nba.matchup(game);const scenario=buildScenario(bundle,game.id);store.saveScenario(scenario);store.record('audit',{action:'public-nba-projection',eventId:scenario.id,fetchedAt:bundle.fetchedAt});const projection=await project(scenario,42);dataJob={state:'complete',gameId:game.id,eventId:scenario.id,runId:projection.id,warnings:scenario.warnings};}catch(e){dataJob={state:'failed',gameId:game.id,error:e.status?e.message:'NBA data could not be prepared. Saved data has been retained.'};}})();
    send(res,202,dataJob);return;
   }
   if(path==='/api/scenarios'){validateScenario(body);store.saveScenario(body);store.record('audit',{action:'scenario-import',eventId:body.id});send(res,201,{id:body.id});return;}
   if(path==='/api/simulate'){const scenario=body.scenario||store.scenario(body.eventId);send(res,200,await project(scenario,body.seed??42));return;}
   if(path==='/api/odds/import'){assert(Array.isArray(body.quotes)&&body.quotes.length>0&&body.quotes.length<=2000,'1–2000 quotes required');const qs=body.quotes.map(q=>{const s=store.scenario(q.eventId);assert(s,'Unknown event');return normalizeQuote(q,s);});const inserted=store.importQuotes(qs);store.record('audit',{action:'odds-import',inserted});send(res,201,{inserted});return;}
   if(path==='/api/mappings'){for(const k of ['source','kind','externalId','canonicalId'])string(body[k],k);assert(['event','team','player'].includes(body.kind),'Mapping kind invalid');const ss=store.scenarios();assert(ss.some(s=>body.kind==='event'?s.id===body.canonicalId:body.kind==='team'?s.teams.some(t=>t.id===body.canonicalId):s.teams.some(t=>t.players.some(p=>p.id===body.canonicalId))),'Unknown canonical identifier');store.map(body);send(res,201,{saved:true});return;}
   if(path==='/api/provider/fetch'){
    const rightsBasis='Owner-approved Odds API NBA use';const cache=store.cache('nba-odds');let raw=cache&&Date.now()-cache.savedAt<15*60000?cache.body:await fetchApprovedOdds();assert(Array.isArray(raw),'Invalid odds provider response');if(!cache||raw!==cache.body)store.saveCache('nba-odds',raw);
    registerExactMatches(raw,store);let mapped=mapProviderEvents(raw,store,{rightsBasis}),note='Sportsbet game markets refreshed. Unmatched events are held for review.';
    if(body.eventId){const e=raw.find(e=>store.resolve('the-odds-api','event',e.id)===body.eventId);if(e){try{const key='nba-props:'+e.id,c=store.cache(key);const props=c&&Date.now()-c.savedAt<15*60000?c.body:await fetchApprovedOdds(process.env,e.id);if(!c||props!==c.body)store.saveCache(key,props);registerExactMatches([props],store);const pm=mapProviderEvents([props],store,{rightsBasis});mapped.quotes.push(...pm.quotes);mapped.quarantine.push(...pm.quarantine);note=pm.quotes.length?'Game and available Sportsbet player markets refreshed.':'Sportsbet returned no supported player props for this game. Game markets remain available.';}catch(e){note='Game markets loaded; player props unavailable: '+(e.status?e.message:'Provider request failed.');}}}
    const inserted=store.importQuotes(mapped.quotes);store.record('audit',{action:'provider-fetch',inserted,quarantine:mapped.quarantine});send(res,200,{inserted,quarantine:mapped.quarantine,note});return;
   }
   if(path==='/api/backtest'){const rows=body.demo?demoHistory():body.live?store.historicalForecasts():body.rows;const report=await work({kind:'backtest',rows});store.record('reports',report);send(res,200,report);return;}
  }
  if(req.method==='GET'){
   if(path==='/api/health'){store.db.prepare('SELECT 1').get();send(res,200,{ok:true});return;}
   if(path==='/api/nba/schedule'){send(res,200,scheduleView(store.cache('nba-schedule')?.body,store));return;}
   if(path==='/api/nba/job'){send(res,200,dataJob);return;}
   if(path==='/api/nba/roster'){const bundle=store.cache('matchup:'+url.searchParams.get('gameId'))?.body;send(res,200,bundle?{fetchedAt:bundle.fetchedAt,players:bundle.players,injuries:bundle.injuries}:{players:[],injuries:[]});return;}
   if(path==='/api/nba/projection'){const eventId=url.searchParams.get('eventId'),run=store.latestRun(eventId);assert(run,'Projection is still being prepared');send(res,200,{...run.summary,id:run.id,histogram:run.histogram,quotes:run.quotes||[]});return;}
   if(path==='/api/status'){send(res,200,{timezone:'Australia/Sydney',mode:'research MVP',authRequired:!!adminToken&&!loggedIn,secure:!!passwordHash,provider:process.env.ODDS_PROVIDER||'manual',feedApproved:process.env.ODDS_FEED_APPROVED==='true',liveData:!!store.cache('nba-schedule'),modelValidated:false});return;}
   if(path==='/api/scenarios'){send(res,200,store.scenarios());return;}
   if(path==='/api/mappings'){send(res,200,store.mappings());return;}
   if(path==='/api/backtest'){send(res,200,store.latestReport());return;}
   if(path==='/api/accuracy'){send(res,200,{modelVersion:TRAINED_MODEL_VERSION,generatedAt:gameArtifact.generatedAt,game:gameArtifact.summary,gameLimitations:gameArtifact.limitations,player:{candidate:playerArtifact.candidate,baseline:playerArtifact.baseline,folds:playerArtifact.folds,promotion:playerArtifact.promotion,parameters:playerArtifact.parameters,limitations:playerArtifact.limitations},prospective:{settledGames:store.modelForecasts(TRAINED_MODEL_VERSION).length,validationPending:true}});return;}
   if(path==='/api/history'){const [gameText,playerText]=await Promise.all([readFile(new URL('../model-artifact.json',import.meta.url),'utf8'),readFile(new URL('../player-history-artifact.json',import.meta.url),'utf8')]);const {modelVersion,generatedAt,limitations,source,validation}=JSON.parse(gameText),players=JSON.parse(playerText);const {provider,attribution,licenseUrl,releaseUrl,coverage,totalRows,totalAppearances,repairs,normalizedSha256}=players;send(res,200,{modelVersion,generatedAt,limitations,source,validation,playerHistory:{provider,attribution,licenseUrl,releaseUrl,coverage,totalRows,totalAppearances,normalizedSha256,repairs:{requested:repairs.requested,repaired:repairs.repaired,excludedGames:repairs.excludedGames},limitations:players.limitations}});return;}
   const files={'/':'index.html','/app.js':'app.js','/performance.js':'performance.js','/style.css':'style.css'};
   if(files[path]){const data=await renderFile(files[path]);res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});res.end(data);return;}
  }
  send(res,404,{error:'Not found'});
 }catch(e){send(res,e.status||500,{error:e.status?e.message:'Operation failed. Check server configuration or imported data.'});if(!e.status)console.error('Request failed',e.name);}
 });
 return {server,store};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const {server,store}=createApp();server.listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log(`NBA Lab: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3000}`));process.on('SIGTERM',()=>server.close(()=>{store.db.close();process.exit(0);}));}
