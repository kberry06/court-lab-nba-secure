import {readFileSync,writeFileSync} from 'node:fs';
import {walkForward} from './backtest.js';
if(!process.argv[2]) {console.error('Usage: npm run backtest -- historical.json report.json');process.exit(1);}
const report=walkForward(JSON.parse(readFileSync(process.argv[2],'utf8')));writeFileSync(process.argv[3]||'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({count:report.count,synthetic:report.synthetic,brier:report.calibrated.brier}));
