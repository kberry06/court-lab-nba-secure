import {mostProbableSelections} from '../public/top-selections.js';
export const sydneyDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function selectionSlate(store,{date=sydneyDate(Date.now()),marketFamily='all',now=Date.now()}={}){
 const schedule=store.cache('nba-schedule')?.body;
 const games=(schedule?.games||[]).filter(g=>g.datetime&&sydneyDate(g.datetime)===date).sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime)).map(g=>{
  const id='espn:game:'+g.id,run=store.latestRun(id),scenario=run?.scenario,result=run?.summary;
  const shortlist=scenario?mostProbableSelections(run.quotes||[],result,scenario,{now,marketFamily,currentQuotes:store.quotes(id)}):{selections:[],available:0,target:4,reason:'No saved projection yet. Open this matchup to prepare it.'};
  if(g.status_state!=='scheduled'){shortlist.selections=[];shortlist.available=0;shortlist.reason='Only scheduled pregame markets are listed.';}
  return {id,start:g.datetime,status:g.status_state,home:g.home_team.full_name||g.home_team.name,away:g.visitor_team.full_name||g.visitor_team.name,projectionAt:result?.generatedAt||null,inputsAt:scenario?.asOf||null,modelVersion:result?.modelVersion||null,...shortlist};
 });
 return {date,timezone:'Australia/Sydney',checkedAt:new Date(now).toISOString(),scheduleAt:schedule?.fetchedAt||null,marketFamily,games};
}
