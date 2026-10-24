import {assert,timestamp} from './validation.js';
export function compactInputSnapshot(bundle,gameId,now=Date.now()){
 const game=bundle.games?.find(g=>String(g.id)===String(gameId));assert(bundle.provider==='espn'&&game,'Known public NBA event required');
 timestamp(bundle.fetchedAt,'input observation');timestamp(game.datetime,'game start');
 assert(Date.parse(bundle.fetchedAt)<=now+60000,'Input observation cannot be in the future');
 assert(now<Date.parse(game.datetime)&&Date.parse(bundle.fetchedAt)<Date.parse(game.datetime),'Only pregame input observations can be archived');
 const payload={provider:bundle.provider,rightsBasis:bundle.rightsBasis,game:{id:game.id,start:game.datetime,homeTeamId:game.home_team.id,awayTeamId:game.visitor_team.id},players:bundle.players.map(p=>({id:p.id,teamId:p.team.id,name:`${p.first_name} ${p.last_name}`,position:p.position})).sort((a,b)=>a.id-b.id),injuries:bundle.injuries.map(i=>({playerId:i.player.id,status:i.status,reportedUpdatedAt:i.updatedAt||null})).sort((a,b)=>a.playerId-b.playerId)};
 return {eventId:'espn:game:'+game.id,observedAt:new Date(bundle.fetchedAt).toISOString(),receivedAt:new Date(now).toISOString(),payload};
}
