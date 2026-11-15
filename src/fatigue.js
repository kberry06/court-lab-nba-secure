import {roleMinuteSd} from './rotation-minutes.js';
const hour=3600000;
// Tip-to-tip intervals are schedule proxies, not measured recovery time.
export function playerWorkload(rows,targetStart,baseSd){
 const at=Date.parse(targetStart),history=rows.filter(r=>Number.isFinite(Date.parse(r.datetime))&&Date.parse(r.datetime)<at&&Number.isFinite(r.minutes)&&r.minutes>0).sort((a,b)=>Date.parse(b.datetime)-Date.parse(a.datetime));
 const gap=history.length?(at-Date.parse(history[0].datetime))/hour:null,backToBack=gap!==null&&gap<=36;
 const comparable=history.filter((r,i)=>history[i+1]&&(Date.parse(r.datetime)-Date.parse(history[i+1].datetime))/hour<=36);
 // Own earlier back-to-backs can widen uncertainty; no invented point penalty.
 const conditioned=backToBack&&comparable.length>=3?roleMinuteSd(comparable):baseSd;
 return {lastGameAt:history[0]?.datetime??null,lastGameMinutes:history[0]?.minutes??null,hoursBetweenTips:gap,backToBack,minutesLast72Hours:history.filter(r=>at-Date.parse(r.datetime)<=72*hour).reduce((n,r)=>n+r.minutes,0),comparableGames:comparable.length,minuteSd:Math.max(baseSd,conditioned),method:'schedule-rest-and-observed-workload-1'};
}
