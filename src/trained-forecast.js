import {readFileSync} from 'node:fs';
import {createFeatureState,enterSeason,gameFeatures,recordScheduledStart,updateFinalScore} from './accuracy-features.js';
import {predictRegression,sigmoid,logit} from './regression.js';
export const gameArtifact=JSON.parse(readFileSync(new URL('../game-model-artifact.json',import.meta.url),'utf8'));
export const playerArtifact=JSON.parse(readFileSync(new URL('../player-model-artifact.json',import.meta.url),'utf8'));
export const TRAINED_MODEL_VERSION='trained-opponent-rest-player-1';
export function buildGameForecast(bundle,g,artifact=gameArtifact){
 const asOf=Date.parse(bundle.fetchedAt);
 if(!artifact.summary.promotion.passed||asOf<=Date.parse(artifact.trainingLastGameAt)+86400000||!bundle.leagueHistoryComplete)return null;
 const state=createFeatureState(artifact.state),season=g.season||new Date(g.datetime).getUTCFullYear()+(new Date(g.datetime).getUTCMonth()>=8?1:0);enterSeason(state,season);
 const history=bundle.games.filter(r=>r.id!==g.id&&['final','in_progress'].includes(r.status_state)&&Date.parse(r.datetime)>Date.parse(artifact.trainingLastGameAt)&&Date.parse(r.datetime)<asOf).sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime)||a.id-b.id);
 for(const row of history){if(row.status_state==='final'&&Date.parse(row.datetime)+86400000<asOf)updateFinalScore(state,row);recordScheduledStart(state,row);}
 const features=gameFeatures(state,g),m=artifact.liveModel,probability=sigmoid(m.calibration.intercept+m.calibration.slope*logit(predictRegression(m.classifier,features))),totalMean=Math.max(140,Math.min(300,predictRegression(m.totalModel,features)+m.totalOffset));
 return {modelVersion:TRAINED_MODEL_VERSION,trainingLastGameAt:artifact.trainingLastGameAt,asOf:bundle.fetchedAt,probability,marginMean:m.marginScale*logit(probability),marginScale:m.marginScale,totalMean,totalSd:m.totalSd,rho:m.rho,features,updatedGames:history.length};
}
