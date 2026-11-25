import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {easternReportTimestamp} from './pit-evidence.js';
const execute=promisify(execFile),pageUrl='https://www.nba.com/players/injury-report';
const key=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const aliases={NYK:'NY',GSW:'GS',NOP:'NO',UTA:'UTAH',SAS:'SA',WAS:'WSH'},abbr=s=>aliases[s]||s;
export function latestOfficialLink(html,now){
 const links=[...new Set(html.match(/https:\/\/ak-static\.cms\.nba\.com\/referee\/injury\/Injury-Report_\d{4}-\d\d-\d\d_\d\d_\d\d[AP]M\.pdf/g)||[])].map(url=>{const m=/_(\d{4})-(\d\d)-(\d\d)_(\d\d)_(\d\d)(AM|PM)\.pdf$/.exec(url);try{return {url,publishedAt:easternReportTimestamp(`${m[2]}/${m[3]}/${m[1].slice(2)} ${m[4]}:${m[5]} ${m[6]}`)};}catch{return null;}}).filter(r=>r&&Date.parse(r.publishedAt)<=now).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
 if(!links.length)throw Error('No valid published official report link');return links[0];
}
export async function extractOfficialPdf(bytes){
 const base=resolve(tmpdir()),dir=await mkdtemp(join(base,'court-injury-'));
 if(!resolve(dir).startsWith(base+sep+'court-injury-'))throw Error('Invalid injury extraction directory');
 try{const input=join(dir,'report.pdf'),output=join(dir,'report.json');await writeFile(input,bytes);
  await execute(process.platform==='win32'?'python':'python3',[fileURLToPath(new URL('../scripts/extract-injury-pdf.py',import.meta.url)),input,output],{timeout:20000,maxBuffer:200000,windowsHide:true});
  return JSON.parse(await readFile(output,'utf8'));
 }finally{await rm(dir,{recursive:true,force:true});}
}
async function boundedBody(response,limit){if(!response.ok)throw Error('Official NBA injury source HTTP '+response.status);const parts=[];let size=0;for await(const part of response.body){size+=part.length;if(size>limit)throw Error('Official report exceeds extraction limit');parts.push(part);}return Buffer.concat(parts);}
export function officialInjuries(store,{fetcher=fetch,clock=Date.now,extract=extractOfficialPdf}={}){
 return {async load({force=false}={}){
  const cache=store.cache('official-injury-report:v1');if(!force&&cache&&clock()-cache.savedAt<5*60000)return cache.body;
  let result;try{
   const html=(await boundedBody(await fetcher(pageUrl,{signal:AbortSignal.timeout(15000),redirect:'error'}),4*1024*1024)).toString('utf8'),link=latestOfficialLink(html,clock());
   const bytes=await boundedBody(await fetcher(link.url,{signal:AbortSignal.timeout(15000),redirect:'error'}),3*1024*1024);
   if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Official source did not return a PDF');
   const document=await extract(bytes),headerAt=easternReportTimestamp(document.reportHeader),sha=createHash('sha256').update(bytes).digest('hex');
   if(headerAt!==link.publishedAt||document.fileSha256!==sha||!Array.isArray(document.rows)||!document.rows.length||document.rows.length>1500||document.pageCount>32)throw Error('Official report extraction failed verification');
   result={state:'received',sourceUrl:link.url,sourcePage:pageUrl,publishedAt:headerAt,receivedAt:new Date(clock()).toISOString(),sourceSha256:sha,pageCount:document.pageCount,rows:document.rows};
  }catch(e){const failureCode=e.code==='ENOENT'?'parser_missing':/HTTP/.test(e.message)?'source_access':e.killed?'parser_timeout':'verification_failed';result={state:'unavailable',failureCode,sourcePage:pageUrl,receivedAt:new Date(clock()).toISOString(),reason:'Official report unavailable or could not be verified; selections require review'};console.warn('Official injury report unavailable',failureCode);}
  store.saveCache('official-injury-report:v1',result);return result;
 }};
}
export function mapOfficialInjuries(report,game,players){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(game.datetime)),teams=[game.home_team,game.visitor_team],rows=[],teamCoverage={},issues=[];
 const matchup=abbr(game.visitor_team.abbreviation)+'@'+abbr(game.home_team.abbreviation);
 for(const t of teams){const matching=(report.rows||[]).filter(r=>{const d=r.gameDate?.split('/'),m=r.matchup?.split('@');return d?.length===3&&`${d[2]}-${d[0]}-${d[1]}`===date&&m?.length===2&&abbr(m[0])+'@'+abbr(m[1])===matchup&&key(r.teamToken)===key(t.full_name||t.name);});
  const submitted=matching.length>0&&matching.every(r=>r.status!=='Not submitted');teamCoverage[t.id]=submitted;
  if(!submitted)issues.push((t.full_name||t.name)+': official team report missing or not submitted');
  const seen=new Set();for(const r of matching){if(!r.playerToken)continue;const [last,...first]=r.playerToken.split(','),name=first.join(',')+' '+last,candidates=players.filter(p=>p.team.id===t.id&&key(p.first_name+' '+p.last_name)===key(name));
   if(candidates.length!==1||!['Out','Doubtful','Questionable','Probable','Available'].includes(r.status)||seen.has(candidates[0]?.id)){issues.push((t.full_name||t.name)+': an official player designation needs mapping review');continue;}
   seen.add(candidates[0].id);rows.push({player:{id:candidates[0].id},teamId:t.id,status:r.status,reason:r.reason,source:'nba-official',sourceUrl:report.sourceUrl,publishedAt:report.publishedAt,receivedAt:report.receivedAt,sourceSha256:report.sourceSha256,sourcePage:r.page});
  }
 }
 return {state:report.state==='received'&&!issues.length?'verified':'review',teamCoverage,issues,injuries:rows,publishedAt:report.publishedAt||null,receivedAt:report.receivedAt,sourceUrl:report.sourceUrl||report.sourcePage,sourceSha256:report.sourceSha256||null};
}
