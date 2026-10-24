export const marketLabels={moneyline:'Match winner',spread:'Handicap',total:'Game total',player_points:'Points',player_rebounds:'Rebounds',player_assists:'Assists',player_pra:'PRA',player_pa:'Points + assists',player_ra:'Rebounds + assists',player_pr:'Points + rebounds'};
export function quoteTeam(q,scenario){
 if(q.playerId)return scenario.teams.find(t=>t.players.some(p=>p.id===q.playerId))?.id||null;
 return ['moneyline','spread'].includes(q.market)?scenario.teams[q.selection==='home'?0:1]?.id:null;
}
export function filterQuotes(quotes,scenario,{team='',player='',market='',freshness=''}={}){
 return quotes.filter(q=>(!team||quoteTeam(q,scenario)===team||q.market==='total')&&(!player||q.playerId===player)&&(!market||q.market===market)&&(freshness!=='fresh'||!q.stale&&!q.started&&!q.inputsStale));
}
// Display probability bands, not evidence of model accuracy or a betting rating.
export function confidence(q){
 if(q.stale||q.started||q.inputsStale||!q.eligible||!Number.isFinite(q.modelProbability))return 'Low';
 return q.modelProbability>=.7?'High':q.modelProbability>=.55?'Medium':'Low';
}
export function projectionDifference(q,result){
 let projection=null;
 if(q.market==='total')projection=result.total?.mean;
 if(q.market==='spread')projection=(q.selection==='home'?1:-1)*result.margin?.mean;
 if(q.playerId){const p=result.players.find(p=>p.id===q.playerId),keys={player_points:['points'],player_rebounds:['rebounds'],player_assists:['assists'],player_pra:['points','rebounds','assists'],player_pa:['points','assists'],player_ra:['rebounds','assists'],player_pr:['points','rebounds']}[q.market];if(p&&keys&&keys.every(k=>Number.isFinite(p[k]?.mean)))projection=keys.reduce((sum,k)=>sum+p[k].mean,0);}
 if(!Number.isFinite(projection)||!Number.isFinite(q.line))return {projection:null,difference:null,favorable:null};
 const difference=q.market==='spread'?projection+q.line:projection-q.line;
 return {projection,difference,favorable:q.selection==='under'?-difference:difference};
}

export function currentQuote(q,scenario,now=Date.now()){return {...q,stale:!!q.stale||now-Date.parse(q.observedAt)>15*60000,started:!!q.started||now>=Date.parse(scenario.start),inputsStale:!!q.inputsStale||now-Date.parse(scenario.asOf)>24*3600000};}
