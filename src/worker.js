import {parentPort,workerData} from 'node:worker_threads';
import {simulate} from './model.js';
import {walkForward} from './backtest.js';
import {readFileSync} from 'node:fs';
import {countChallenger} from './count-challenger.js';
function shadowComparisons(){
 const incumbent=simulate(workerData.incumbent,{seed:workerData.seed});
 // The count challenger only needs the incumbent game draws. Do not retain its
 // player samples while calculating the research rotation on small instances.
 delete incumbent.samples.players;delete incumbent.samples.minutes;
 const rotation=simulate(workerData.scenario,{seed:workerData.seed}),{samples,...rotationSummary}=rotation;
 try{const artifact=JSON.parse(readFileSync(new URL('../player-count-model.json',import.meta.url),'utf8')),count=countChallenger(workerData.scenario,incumbent,rotation,artifact),{samples:unused,...countSummary}=count;return {rotationSummary,countSummary};}
 catch{return {rotationSummary,countState:'unavailable'};}
}
try {parentPort.postMessage({result:workerData.kind==='shadow-comparisons'?shadowComparisons():workerData.kind==='simulation'?simulate(workerData.scenario,{seed:workerData.seed}):walkForward(workerData.rows)});}catch(e){parentPort.postMessage({error:e.message});}
