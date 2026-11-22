import test from 'node:test';
import assert from 'node:assert/strict';
import {demoScenario} from '../src/demo.js';
import {simulate,rng,normal} from '../src/model.js';
import {countChallenger} from '../src/count-challenger.js';
import {COUNT_VERSION,fitCountModel,validateCountModel,poisson,scoreAllocation,rateShocks} from '../src/player-count-model.js';
const parameters={version:COUNT_VERSION,shadowOnly:true,trainingLastSettledAt:'2026-04-01T00:00:00Z',cases:1000,lower:[[.4,0,0],[.1,.3,0],[.05,.05,.4]],rateCorrection:{points:1,rebounds:1,assists:1}};
test('count sampler preserves means and learned positive joint rate variation',()=>{
 const random=rng(8381),n=40000;let sum=0,squares=0,x=0,y=0,xy=0;
 for(let i=0;i<n;i++){const value=poisson(5,random),v=rateShocks(parameters.lower,random,normal);sum+=value;squares+=value*value;x+=v[0];y+=v[1];xy+=v[0]*v[1];}
 assert.ok(Math.abs(sum/n-5)<.08);assert.ok(Math.abs(squares/n-(sum/n)**2-5)<.18);assert.ok(Math.abs(x/n-1)<.02);assert.ok(Math.abs(y/n-1)<.02);assert.ok(xy/n-x*y/n**2>.025);
 assert.deepEqual(scoreAllocation(110,[0,5,0],random),[0,110,0]);assert.throws(()=>scoreAllocation(110,[0,0],random));assert.throws(()=>poisson(Infinity,random));
});
test('conditional rate fit learns exposure variability and enforces training embargo',()=>{
 const random=rng(61),rows=Array.from({length:12000},()=>{const shocks=rateShocks(parameters.lower,random,normal),mean={points:15,rebounds:6,assists:4};return {minutes:30,mean,actual:Object.fromEntries(Object.keys(mean).map((k,j)=>[k,poisson(mean[k]*shocks[j],random)]))};}),fit=fitCountModel(rows,{trainingLastSettledAt:parameters.trainingLastSettledAt});
 assert.ok(Math.abs(fit.rawOverdispersion[0][0]-(Math.exp(.16)-1))<.025);assert.ok(Math.abs(fit.rateCorrection.rebounds-1)<.03);validateCountModel(fit,'2026-10-01T00:00:00Z');assert.throws(()=>validateCountModel(fit,'2026-04-01T12:00:00Z'),/embargo/);assert.throws(()=>fitCountModel(rows.slice(0,100),{trainingLastSettledAt:parameters.trainingLastSettledAt}),/evidence/);assert.throws(()=>validateCountModel({...fit,lower:[[NaN,0,0],[0,1,0],[0,0,1]]},'2026-10-01T00:00:00Z'));
});
test('challenger preserves incumbent game draws and rotation minutes, legal counts and confirmed outs',()=>{
 const scenario=demoScenario();scenario.teams[0].players[0].availability=0;
 const incumbent=simulate(scenario,{seed:21}),before=structuredClone(incumbent),rotation=simulate(scenario,{seed:43}),minutes=rotation.samples.players[scenario.teams[0].players[1].id].minutes.slice(),result=countChallenger(scenario,incumbent,rotation,parameters);
 assert.deepEqual(incumbent,before);assert.equal(result.modelVersion,COUNT_VERSION);assert.equal(result.distributionValidated,false);assert.deepEqual(result.home,incumbent.home);assert.deepEqual(result.samples.margin,incumbent.samples.margin);assert.deepEqual(result.samples.players[scenario.teams[0].players[1].id].minutes,minutes);
 for(let d=0;d<10000;d++)for(let side=0;side<2;side++){const team=scenario.teams[side];assert.equal(team.players.reduce((sum,p)=>sum+result.samples.players[p.id].points[d],0),incumbent.samples.scores[side][d]);for(const p of team.players){const v=result.samples.players[p.id];for(const k of ['points','rebounds','assists']){assert.ok(Number.isInteger(v[k][d])&&v[k][d]>=0);if(!v.active[d])assert.equal(v[k][d],0);}}}
 assert.equal(result.players[0].conditional.points.mean,null);assert.equal(result.players[0].appearanceProbability,0);
});
