import {parentPort,workerData} from 'node:worker_threads';
import {simulate} from './model.js';
import {walkForward} from './backtest.js';
try {parentPort.postMessage({result:workerData.kind==='simulation'?simulate(workerData.scenario,{seed:workerData.seed}):walkForward(workerData.rows)});}catch(e){parentPort.postMessage({error:e.message});}
