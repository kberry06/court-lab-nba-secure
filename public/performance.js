export const metricInfo={points:{label:'Points',keys:['points'],market:'player_points'},assists:{label:'Assists',keys:['assists'],market:'player_assists'},rebounds:{label:'Rebounds',keys:['rebounds'],market:'player_rebounds'},pra:{label:'PTS + REB + AST',keys:['points','rebounds','assists'],market:'player_pra'},pa:{label:'PTS + AST',keys:['points','assists'],market:'player_pa'},ra:{label:'REB + AST',keys:['rebounds','assists'],market:'player_ra'},pr:{label:'PTS + REB',keys:['points','rebounds'],market:'player_pr'}};
export const metricValue=(row,metric)=>metricInfo[metric].keys.reduce((n,k)=>n+Number(row?.[k]||0),0);
export function marketLines(quotes,eventId,playerId,metric,now=Date.now()){
 const byLine=new Map();
 for(const q of quotes||[]){const at=Date.parse(q.observedAt);if(q.eventId!==eventId||q.playerId!==playerId||q.market!==metricInfo[metric].market||String(q.bookmaker).toLowerCase()!=='sportsbet'||q.period!=='full_game'||q.includesOvertime!==true||!Number.isFinite(q.line)||q.line<0||q.line>500||!Number.isFinite(at)||at>now+60000)continue;
  const old=byLine.get(q.line),main=!!q.providerMarket&&!q.providerMarket.endsWith('_alternate');
  if(!old||at>Date.parse(old.observedAt)||at===Date.parse(old.observedAt)&&main&&!old.main)byLine.set(q.line,{line:q.line,observedAt:q.observedAt,stale:now-at>15*60000,bookmaker:'Sportsbet',main,alternate:!!q.providerMarket&&q.providerMarket.endsWith('_alternate')});
 }
 return [...byLine.values()].sort((a,b)=>Number(a.stale)-Number(b.stale)||Number(b.main)-Number(a.main)||Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.line-b.line);
}
export function compareLine(values,line){const out={over:0,under:0,equal:0,count:0};if(!Number.isFinite(line))return out;for(const v of values){if(!Number.isFinite(v))continue;out.count++;out[v>line?'over':v<line?'under':'equal']++;}return out;}
export function chartCeiling(values,projection,line){return Math.max(5,...values.filter(Number.isFinite),...[projection,line].filter(Number.isFinite))*1.15;}
