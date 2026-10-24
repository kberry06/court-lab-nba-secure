export const marketLabels={moneyline:'Match winner',spread:'Handicap',total:'Game total',player_points:'Points',player_rebounds:'Rebounds',player_assists:'Assists',player_pra:'PRA',player_pa:'Points + assists',player_ra:'Rebounds + assists',player_pr:'Points + rebounds'};
export function quoteTeam(q,scenario){
 if(q.playerId)return scenario.teams.find(t=>t.players.some(p=>p.id===q.playerId))?.id||null;
 return ['moneyline','spread'].includes(q.market)?scenario.teams[q.selection==='home'?0:1]?.id:null;
}
export function filterQuotes(quotes,scenario,{team='',player='',market='',freshness='',selection=''}={}){
 return quotes.filter(q=>(!team||quoteTeam(q,scenario)===team||q.market==='total')&&(!player||q.playerId===player)&&(!market||q.market===market)&&(!selection||q.selection===selection)&&(freshness!=='fresh'||!q.stale&&!q.started&&!q.inputsStale));
}
// Display probability bands, not evidence of model accuracy or a betting rating.
export function confidence(q){
 if(q.market?.startsWith('player_')&&q.distributionValidated!==true)return 'Low';
 if(q.reviewReasons?.length||q.stale||q.started||q.inputsStale||!q.eligible||!Number.isFinite(q.modelProbability))return 'Low';
 return q.modelProbability>=.7?'High':q.modelProbability>=.55?'Medium':'Low';
}
export function projectionDifference(q,result){
 let projection=null;
 if(q.market==='total')projection=result.total?.mean;
 if(q.market==='spread')projection=(q.selection==='home'?1:-1)*result.margin?.mean;
 if(q.playerId){const raw=result.players.find(p=>p.id===q.playerId),p=raw?.conditional||raw,keys={player_points:['points'],player_rebounds:['rebounds'],player_assists:['assists'],player_pra:['points','rebounds','assists'],player_pa:['points','assists'],player_ra:['rebounds','assists'],player_pr:['points','rebounds']}[q.market];if(p&&keys&&keys.every(k=>Number.isFinite(p[k]?.mean)))projection=keys.reduce((sum,k)=>sum+p[k].mean,0);}
 if(!Number.isFinite(projection)||!Number.isFinite(q.line))return {projection:null,difference:null,favorable:null};
 const difference=q.market==='spread'?projection+q.line:projection-q.line;
 return {projection,difference,favorable:q.selection==='under'?-difference:difference};
}

export function currentQuote(q,scenario,now=Date.now()){return {...q,stale:!!q.stale||now-Date.parse(q.observedAt)>15*60000,started:!!q.started||now>=Date.parse(scenario.start),inputsStale:!!q.inputsStale||now-Date.parse(scenario.asOf)>24*3600000};}

export function propReviewReasons(q,result,scenario){
 if(!q.playerId)return [];
 const input=scenario.teams.flatMap(t=>t.players).find(p=>p.id===q.playerId),p=result.players.find(p=>p.id===q.playerId),reasons=[];
 if(!input||!p)return ['Player inputs unavailable'];
 if(q.distributionValidated!==true)reasons.push('Final player distributions are not calibrated; research only');
 if(input.availability<1)reasons.push('Availability uncertain; DNP voids. Projection is if playing');
 if(input.priorModeled)reasons.push('Limited player history');
 const keys={player_points:['points'],player_rebounds:['rebounds'],player_assists:['assists'],player_pra:['points','rebounds','assists'],player_pa:['points','assists'],player_ra:['rebounds','assists'],player_pr:['points','rebounds']}[q.market],recent=(input.recent||[]).slice(0,5),projection=projectionDifference(q,result).projection;
 if(keys&&recent.length>=3&&Number.isFinite(projection)){const average=recent.reduce((sum,row)=>sum+keys.reduce((n,k)=>n+row[k],0),0)/recent.length;if(average>=3&&Math.abs(projection-average)/average>.35)reasons.push('Projection differs from recent form by over 35%; review rotation minutes');}
 return reasons;
}

export function groupPlayerQuotes(quotes){
 const groups=new Map();
 for(const q of quotes){if(!q.playerId)continue;const key=JSON.stringify([q.eventId,q.source,q.bookmaker,q.playerId,q.market]);if(!groups.has(key))groups.set(key,{key,playerId:q.playerId,market:q.market,quotes:[]});groups.get(key).quotes.push(q);}
 return [...groups.values()].map(g=>{
  const primary=g.quotes.filter(q=>q.providerMarket&&!q.providerMarket.endsWith('_alternate')).sort((a,b)=>Number(!!a.stale)-Number(!!b.stale)||Date.parse(b.observedAt)-Date.parse(a.observedAt));
  const chosen=primary[0],main=chosen?g.quotes.filter(q=>q.line===chosen.line&&q.providerMarket&&!q.providerMarket.endsWith('_alternate')):[];
  const others=g.quotes.filter(q=>!main.includes(q)),lines=new Map();
  for(const q of others){const kind=q.providerMarket?.endsWith('_alternate')?'Alternate':q.providerMarket?'Previous main':'Reference',key=kind+':'+q.line;if(!lines.has(key))lines.set(key,{line:q.line,kind,quotes:[]});lines.get(key).quotes.push(q);}
  return {...g,main,alternates:[...lines.values()].sort((a,b)=>a.line-b.line||a.kind.localeCompare(b.kind))};
 });
}
export function selectionLabel(q){
 if(q.playerId&&q.providerMarket?.endsWith('_alternate')&&q.selection==='over'&&q.line>=0&&q.line%1===.5)return (q.line+.5)+'+';
 return q.selection[0].toUpperCase()+q.selection.slice(1)+(Number.isFinite(q.line)?' '+q.line:'');
}
