import {assert,timestamp} from './validation.js';
export function easternReportTimestamp(header){
 const match=/^(\d\d)\/(\d\d)\/(\d\d) (\d\d):(\d\d) (AM|PM)$/.exec(header);assert(match,'Invalid official report timestamp');const [,month,day,yy,hh,mm,ampm]=match,year=2000+Number(yy),hour=Number(hh)%12+(ampm==='PM'?12:0),target={year:String(year),month,day,hour:String(hour).padStart(2,'0'),minute:mm};
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),base=Date.UTC(year,Number(month)-1,Number(day),hour,Number(mm)),found=[];
 for(let minutes=-14*60;minutes<=14*60;minutes+=15){const date=new Date(base+minutes*60000),parts=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));if(Object.entries(target).every(([k,v])=>parts[k]===v))found.push(date.toISOString());}assert(found.length===1,'Ambiguous/nonexistent Eastern report time; explicit source offset required');return found[0];
}
export function validateEvidence(row){
 for(const key of ['effectiveAt','sourceAvailableAt','receivedAt'])timestamp(row[key],key);
 assert(typeof row.sourceUrl==='string'&&row.sourceUrl.startsWith('https://')&&typeof row.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(row.sourceSha256),'Evidence source and SHA-256 required');
 assert(typeof row.rightsBasis==='string'&&row.rightsBasis.length>0,'Evidence permission basis required');assert(['injury','transaction','roster'].includes(row.kind),'Unknown point-in-time evidence kind');
 assert(typeof row.publicationVerified==='boolean','Explicit publication verification flag required');assert(row.playerId===null||typeof row.playerId==='string','Canonical player ID or explicit null required');return row;
}
export function evidenceAsOf(rows,cutoff,{historical=false}={}){
 const at=Date.parse(cutoff);assert(Number.isFinite(at),'Evidence cutoff required');
 return rows.filter(r=>{validateEvidence(r);return Date.parse(r.effectiveAt)<=at&&Date.parse(r.sourceAvailableAt)<=at&&(historical?r.publicationVerified===true:Date.parse(r.receivedAt)<=at);});
}
export function reconstructRoster(anchor,transactions,cutoff,{historical=false}={}){
 if(!anchor||!evidenceAsOf([anchor],cutoff,{historical}).length)return {status:'missing verified roster anchor',players:[],gaps:['A full pre-cutoff roster anchor is required; an injury list is not a roster.']};
 assert(anchor.kind==='roster'&&Array.isArray(anchor.players)&&anchor.players.length>0,'Full roster anchor required');
 const roster=new Map(anchor.players.map(p=>[p.playerId,{...p}])),applied=[];
 for(const t of evidenceAsOf(transactions,cutoff,{historical}).filter(r=>r.kind==='transaction').sort((a,b)=>Date.parse(a.effectiveAt)-Date.parse(b.effectiveAt)||Date.parse(a.sourceAvailableAt)-Date.parse(b.sourceAvailableAt))){if(Date.parse(t.effectiveAt)<Date.parse(anchor.effectiveAt))continue;assert(t.playerId&&['join','leave'].includes(t.action)&&t.teamId,'Explicit transaction action and canonical identifiers required');if(t.action==='join')roster.set(t.playerId,{playerId:t.playerId,teamId:t.teamId});else if(roster.get(t.playerId)?.teamId===t.teamId)roster.delete(t.playerId);applied.push(t.sourceSha256);}
 return {status:historical?'reconstructed from supplied verified publication evidence':'reconstructed from received evidence',players:[...roster.values()],applied,gaps:[]};
}
