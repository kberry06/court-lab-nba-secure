import {assert} from './validation.js';
import {validateBundle} from './nba-data.js';
const root='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
const day=86400000;
const team=t=>({id:Number(t.id),full_name:t.displayName||t.name,abbreviation:t.abbreviation});
export function normalizeEvent(e) {
  const c=e.competitions?.[0],home=c?.competitors?.find(t=>t.homeAway==='home'),away=c?.competitors?.find(t=>t.homeAway==='away');
  assert(home&&away,'Incomplete public NBA event');
  const st=c.status?.type||e.status?.type||{};
  return {id:Number(e.id),date:e.date?.slice(0,10),datetime:c.timeValid===false?null:e.date,status_state:st.completed?'final':st.name==='STATUS_SCHEDULED'?'scheduled':st.state==='in'?'in_progress':'unknown',home_team:team(home.team),visitor_team:team(away.team),home_team_score:Number(home.score?.value??home.score),visitor_team_score:Number(away.score?.value??away.score),season:e.season?.year,neutralSite:Boolean(c.neutralSite)};
}
export function normalizeRoster(body,t) {
  assert(Array.isArray(body.athletes)&&body.athletes.length,'Roster unavailable from public source');
  return {players:body.athletes.map(p=>({id:Number(p.id),first_name:p.firstName||p.displayName,last_name:p.lastName||'',position:p.position?.abbreviation||'',team:t})),injuries:body.athletes.flatMap(p=>(p.injuries||[]).slice(0,1).map(i=>({player:{id:Number(p.id)},status:i.status||'Unknown',updatedAt:i.date||null})))};
}
export function normalizeBox(body,g) {
  const rows=[];assert(Array.isArray(body.boxscore?.players),'Historical box score is unavailable');
  for(const t of body.boxscore.players)for(const group of t.statistics||[]) {
    const labels=group.labels||[];const ix=k=>labels.indexOf(k);
    assert(['MIN','PTS','REB','AST'].every(k=>ix(k)>=0),'Unsupported box-score columns');
    for(const p of group.athletes||[]){if(p.didNotPlay||!p.stats?.length)continue;const teamId=Number(t.team.id),opponent=g.home_team&&g.visitor_team?(g.home_team.id===teamId?g.visitor_team:g.home_team):{};rows.push({player:{id:Number(p.athlete.id)},game:{id:g.id,date:g.date},team:{id:teamId},opponent:{id:opponent.id,name:opponent.full_name,abbreviation:opponent.abbreviation},min:p.stats[ix('MIN')],pts:Number(p.stats[ix('PTS')]),reb:Number(p.stats[ix('REB')]),ast:Number(p.stats[ix('AST')])});}
  }
  return rows;
}
export function normalizePlayerLog(body,playerId,cutoff) {
  const rows=[];if(!body.seasonTypes?.length)return rows;
  const labels=body.labels||[],index=k=>labels.indexOf(k);
  assert(['MIN','PTS','REB','AST'].every(k=>index(k)>=0),'Unsupported player-history columns');
  for(const season of body.seasonTypes.filter(s=>/Regular Season/.test(s.displayName)))for(const category of season.categories||[])for(const row of category.events||[]){
    const game=body.events?.[row.eventId];if(!game||!['W','L'].includes(game.gameResult)||Date.parse(game.gameDate)>=cutoff)continue;
    if(!row.stats?.length||!Number.isFinite(Number(row.stats[index('MIN')])))continue;
    const opponent=game.opponent?.displayName||game.opponent?.abbreviation||game.opponent?.name||'Opponent';
    rows.push({provenance:'espn-player-gamelog',player:{id:playerId},game:{id:Number(row.eventId),date:game.gameDate.slice(0,10),datetime:game.gameDate,final:true},opponent:{name:opponent,abbreviation:game.opponent?.abbreviation},min:row.stats[index('MIN')],pts:Number(row.stats[index('PTS')]),reb:Number(row.stats[index('REB')]),ast:Number(row.stats[index('AST')])});
  }
  return rows.sort((a,b)=>b.game.date.localeCompare(a.game.date)).slice(0,20);
}
export function publicNba(store,{fetcher=fetch,clock=Date.now}={}) {
  async function get(path,ttl) {
    assert(/^(scoreboard\?|teams\/\d+\/(roster|schedule\?)|summary\?event=\d+|athletes\/\d+\/gamelog\?season=\d+)/.test(path),'Unsupported public data endpoint');
    const old=store.cache('espn:'+path);if(old&&clock()-old.savedAt<ttl)return old.body;
    const base=path.startsWith('athletes/')?'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/':root;
    let response;try{response=await fetcher(base+path,{signal:AbortSignal.timeout(15000),redirect:'error'});}catch{assert(false,'Public NBA source unavailable. Saved data has been retained.');}
    assert(response.ok,`Public NBA source returned HTTP ${response.status}. No access restrictions will be bypassed.`);
    const body=await response.json();store.saveCache('espn:'+path,body);return body;
  }
  return {
    async settlementBody(eventId){assert(/^espn:game:\d+$/.test(eventId),'Invalid settlement event');return get('summary?event='+eventId.split(':').at(-1),5*60000);},
    async schedule(force=false) {
      const previous=store.cache('nba-schedule');if(!force&&previous&&clock()-previous.savedAt<30*60000)return previous.body;
      const date=n=>new Date(n).toISOString().slice(0,10).replaceAll('-','');
      const events=new Map();
      // ESPN rejects date ranges on this endpoint. Use bounded daily requests.
      for(let offset=-1;offset<=7;offset++){
        const raw=await get(`scoreboard?limit=1000&dates=${date(clock()+offset*day)}`,force?0:30*60000);
        assert(Array.isArray(raw.events),'Schedule unavailable from public source');
        for(const event of raw.events)events.set(event.id,event);
      }
      const bundle=validateBundle({provider:'espn',fetchedAt:new Date(clock()).toISOString(),rightsBasis:'User-requested private research from publicly accessible sports data',games:[...events.values()].map(normalizeEvent),players:[],injuries:[],stats:[]},clock());
      store.saveCache('nba-schedule',bundle);return bundle;
    },
    async matchup(game) {
      const cached=store.cache('matchup:'+game.id);if(cached?.body.coverageVersion===3&&clock()-cached.savedAt<30*60000)return cached.body;
      const games=new Map(),players=[],injuries=[],stats=[];
      const season=game.season||new Date(game.datetime).getUTCFullYear()+(new Date(game.datetime).getUTCMonth()>=8?1:0);
      for(const t of [game.home_team,game.visitor_team]) {
        const roster=normalizeRoster(await get(`teams/${t.id}/roster`,30*60000),t);players.push(...roster.players);injuries.push(...roster.injuries);
        let history=[];
        for(const year of [season,season-1]) {
          const raw=await get(`teams/${t.id}/schedule?season=${year}&seasontype=2`,6*3600000);
          assert(Array.isArray(raw.events),'Historical schedule unavailable');
          history.push(...raw.events.filter(e=>e.competitions?.[0]?.type?.id!=='39').map(normalizeEvent).filter(g=>g.status_state==='final'&&Date.parse(g.datetime)<clock()-day));
          if(history.length>=20)break;
        }
        history.sort((a,b)=>b.date.localeCompare(a.date));for(const g of history.slice(0,20))games.set(g.id,g);
      }
      // Bounded, cached requests. No scraping, proxy rotation or access bypass.
      for(const g of games.values())stats.push(...normalizeBox(await get(`summary?event=${g.id}`,365*day),g));
      // Follow the athlete ID across trades instead of assuming current-team history.
      const playerGames=playerId=>new Set(stats.filter(s=>s.player.id===playerId&&parseFloat(s.min)>0).map(s=>s.game.id)).size;
      for(const p of players)if(playerGames(p.id)<20){
        for(const year of [season,season-1]){
          const rows=normalizePlayerLog(await get(`athletes/${p.id}/gamelog?season=${year}`,6*3600000),p.id,clock()-day);stats.push(...rows);
          if(playerGames(p.id)>=20)break;
        }
      }
      // Refresh league-wide results for opponent-adjusted ratings, sharing the six-hour cache across matchups.
      const leagueKey=`nba-league-results:${season}`,leagueCache=store.cache(leagueKey);let league=leagueCache&&clock()-leagueCache.savedAt<6*3600000?leagueCache.body:null;
      if(!league){const events=new Map();for(let teamId=1;teamId<=30;teamId++){const raw=await get(`teams/${teamId}/schedule?season=${season}&seasontype=2`,6*3600000);assert(Array.isArray(raw.events),'League-wide NBA results unavailable');for(const event of raw.events){if(event.competitions?.[0]?.type?.id==='39')continue;const row=normalizeEvent(event);if(['final','in_progress'].includes(row.status_state)&&row.season===season&&Date.parse(row.datetime)<clock())events.set(row.id,row);}}league={games:[...events.values()]};store.saveCache(leagueKey,league);}
      for(const row of league.games)games.set(row.id,row);
      const bundle=validateBundle({provider:'espn',coverageVersion:3,leagueHistoryComplete:true,rightsBasis:'User-requested private research from publicly accessible sports data',fetchedAt:new Date(clock()).toISOString(),games:[...games.values(),game],players,injuries,stats},clock());
      store.saveCache('matchup:'+game.id,bundle);return bundle;
    }
  };
}
