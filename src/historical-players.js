// RFC 4180 quoted fields, escaped quotes and embedded newlines; no runtime dependency.
export function* csvRecords(text) {
 let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x!==''))yield row;row=[];field='';}else field+=c;}
 if(quoted)throw new Error('Unterminated CSV quote');if(field||row.length){row.push(field);yield row;}
}
const numeric=x=>x===''||x==null||x==='NA'?null:Number(x);
export function normalizePlayerCsv(text,games,season) {
 const gameMap=new Map(games.map(g=>[g.id,g])),rows=[],seen=new Map(),byGameTeam=new Map(),quarantine=[],iterator=csvRecords(text),header=iterator.next().value;
 if(!header||!['game_id','athlete_id','team_id','minutes','points','rebounds','assists'].every(k=>header.includes(k)))throw new Error('Unsupported historical player columns');
 let excluded=0,dnp=0;
 for(const fields of iterator){if(fields.length!==header.length)throw new Error('Malformed historical player row');const r=Object.fromEntries(header.map((k,i)=>[k,fields[i]])),g=gameMap.get(Number(r.game_id));if(!g){excluded++;continue;}if(g.season!==season||Number(r.season)!==season)throw new Error('Historical player season mismatch');
  const teamId=Number(r.team_id),playerId=Number(r.athlete_id),didNotPlay=r.did_not_play.toLowerCase()==='true',minutes=didNotPlay?0:numeric(r.minutes);
  if(!Number.isSafeInteger(playerId)||playerId<=0||![g.home_team.id,g.visitor_team.id].includes(teamId)){quarantine.push({gameId:g.id,playerId:r.athlete_id,reason:'Unmapped or missing player/team identifier'});continue;}
  const points=didNotPlay?0:numeric(r.points),rebounds=didNotPlay?0:numeric(r.rebounds),assists=didNotPlay?0:numeric(r.assists);
  if([minutes,points,rebounds,assists].some(x=>x===null||!Number.isFinite(x)||x<0)||minutes>80||points>100||rebounds>60||assists>40||![points,rebounds,assists].every(Number.isInteger)){quarantine.push({gameId:g.id,playerId,reason:'Missing or invalid source stats; no zero/DNP inferred'});continue;}
  const row={provider:'sportsdataverse-espn',season,gameId:g.id,datetime:g.datetime,teamId,playerId,name:r.athlete_display_name,minutes,points,rebounds,assists,didNotPlay,starterObserved:r.starter?.toLowerCase()==='true'};
  const key=`${g.id}:${playerId}`,prior=seen.get(key);if(prior){if(JSON.stringify(prior)!==JSON.stringify(row))throw new Error(`Conflicting player-game duplicate ${key}`);continue;}seen.set(key,row);rows.push(row);if(didNotPlay)dnp++;
  const group=`${g.id}:${teamId}`;if(!byGameTeam.has(group))byGameTeam.set(group,[]);byGameTeam.get(group).push(row);
 }
 const missingGames=[],scoreMismatches=[];
 for(const g of games.filter(g=>g.season===season))for(const t of [g.home_team,g.visitor_team]){const rs=byGameTeam.get(`${g.id}:${t.id}`)||[];if(rs.filter(r=>r.minutes>0).length<5)missingGames.push({gameId:g.id,teamId:t.id});const sum=rs.reduce((n,r)=>n+r.points,0),expected=g.home_team.id===t.id?g.home_team_score:g.visitor_team_score;if(sum!==expected)scoreMismatches.push({gameId:g.id,teamId:t.id,sum,expected});}
 return {rows,coverage:{season,rows:rows.length,appearances:rows.length-dnp,dnp,players:new Set(rows.map(r=>r.playerId)).size,games:new Set(rows.map(r=>r.gameId)).size,excludedNonArchiveRows:excluded,quarantine,missingGames,scoreMismatches}};
}
