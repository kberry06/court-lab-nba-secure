const day=86400000,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const FEATURE_VERSION='opponent-rest-1';
const initial=()=>({slow:0,fast:0,elo:1500,off:0,def:0,lastStart:null,lastAway:false,roadGames:0});
export function createFeatureState(snapshot){return snapshot?structuredClone(snapshot):{season:null,leaguePoints:111,teams:{}};}
const team=(state,id)=>state.teams[id]??=(initial());
export function enterSeason(state,season){if(state.season===season)return;if(state.season!==null)for(const t of Object.values(state.teams)){t.slow*=.65;t.fast*=.45;t.elo=1500+.67*(t.elo-1500);t.off*=.55;t.def*=.55;t.lastStart=null;t.lastAway=false;t.roadGames=0;}state.season=season;}
export function gameFeatures(state,g){
 const h=team(state,g.home_team.id),a=team(state,g.visitor_team.id),at=Date.parse(g.datetime),rest=t=>t.lastStart?clamp((at-t.lastStart)/day-1,0,5):3,hr=rest(h),ar=rest(a);
 return {home:g.neutralSite?0:1,elo:(h.elo-a.elo)/400,slow:(h.slow-a.slow)/10,fast:(h.fast-a.fast)/10,form:(h.off+a.def-a.off-h.def)/10,rest:(hr-ar)/3,backToBack:Number(ar<.5)-Number(hr<.5),roadTrip:clamp(a.roadGames-h.roadGames,-5,5)/5,travelSequence:Number(a.lastAway)-Number(h.lastAway),leagueTotal:(state.leaguePoints*2-220)/20,offTotal:(h.off+a.off)/10,defTotal:(h.def+a.def)/10};
}
export function recordScheduledStart(state,g){for(const [id,away] of [[g.home_team.id,false],[g.visitor_team.id,true]]){const t=team(state,id);t.lastStart=Date.parse(g.datetime);t.lastAway=away;t.roadGames=away?t.roadGames+1:0;}}
export function updateFinalScore(state,g){
 const h=team(state,g.home_team.id),a=team(state,g.visitor_team.id),margin=g.home_team_score-g.visitor_team_score,home=g.neutralSite?0:2.2;
 const slowResidual=clamp(margin-(h.slow-a.slow+home),-35,35),fastResidual=clamp(margin-(h.fast-a.fast+home),-35,35);
 h.slow+=.035*slowResidual;a.slow-=.035*slowResidual;h.fast+=.10*fastResidual;a.fast-=.10*fastResidual;
 const p=1/(1+10**(-(h.elo-a.elo+(g.neutralSite?0:48))/400)),y=Number(margin>0),winnerDiff=(y?1:-1)*(h.elo-a.elo),step=18*Math.log(Math.abs(margin)+1)*2.2/(2.2+.001*winnerDiff)*(y-p);h.elo+=step;a.elo-=step;
 const hp=g.home_team_score-state.leaguePoints,ap=g.visitor_team_score-state.leaguePoints;
 h.off=.90*h.off+.1*hp;h.def=.90*h.def+.1*ap;a.off=.90*a.off+.1*ap;a.def=.90*a.def+.1*hp;state.leaguePoints=.998*state.leaguePoints+.002*(g.home_team_score+g.visitor_team_score)/2;
}
// Results become usable 24 hours after tip-off. Schedule/rest information is known before results.
export function historicalFeatures(games,{snapshot}={}){
 const state=createFeatureState(snapshot),ordered=[...games].sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime)||a.id-b.id),pending=[],rows=[];
 for(const g of ordered){const at=Date.parse(g.datetime);while(pending.length&&Date.parse(pending[0].datetime)+day<at)updateFinalScore(state,pending.shift());enterSeason(state,g.season);rows.push({id:g.id,season:g.season,datetime:g.datetime,features:gameFeatures(state,g),y:Number(g.home_team_score>g.visitor_team_score),actualMargin:g.home_team_score-g.visitor_team_score,actualTotal:g.home_team_score+g.visitor_team_score});recordScheduledStart(state,g);pending.push(g);}
 while(pending.length)updateFinalScore(state,pending.shift());return {rows,state,lastGameAt:ordered.at(-1)?.datetime};
}
