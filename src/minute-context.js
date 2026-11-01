const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
export function minuteContext(player,freeze){
 if(!player)return {flags:['Context unavailable']};
 const roles=(player.recentRoles||[]).filter(r=>Date.parse(r.date+'T23:59:59Z')<Date.parse(freeze)),positive=roles.filter(r=>r.minutes>0),recent=positive.slice(0,3),older=positive.slice(3),flags=[];
 const starts=roles.slice(0,5).filter(r=>typeof r.started==='boolean');
 flags.push(starts.length>=3&&starts.every(r=>r.started)?'Recent observed starter':starts.length>=3?'Recent mixed/bench role':'Starting history unavailable');
 if(recent.length===3&&older.length>=2&&Math.abs(avg(recent.map(r=>r.minutes))-avg(older.map(r=>r.minutes)))>=5)flags.push('Recent minutes changed by at least 5');
 if(player.sampleGames<3)flags.push('Limited history');
 if(roles.length&&Date.parse(freeze)-Date.parse(roles[0].date+'T23:59:59Z')>14*86400000)flags.push('History older than 14 days');
 if(player.injury&&player.injury!=='Not listed')flags.push('Injury status listed');
 if(player.availability<1)flags.push('Reduced assumed availability');
 return {flags,injury:player.injury||'Unknown',availability:player.availability,roleMinutes:player.roleMinutes??null,sampleGames:player.sampleGames??null};
}
