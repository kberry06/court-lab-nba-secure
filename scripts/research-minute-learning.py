"""Fixed robust conditional-minutes model. No new runtime dependencies."""
import json, hashlib, os
from datetime import datetime, timezone
from pathlib import Path
os.environ['OPENBLAS_NUM_THREADS']='1'
os.environ['OMP_NUM_THREADS']='1'
import numpy as np
root=Path(__file__).resolve().parents[1]
source=root/'data/generated/minute-learning-rows.json'
data=json.loads(source.read_text(encoding='utf-8-sig')); rows=data['rows']; names=data['featureNames']
X=np.array([r['x'] for r in rows],dtype=float); masked=np.array([r['masked'] for r in rows],dtype=float); y=np.array([r['actual'] for r in rows]); baseline=np.array([r['baseline'] for r in rows]); seasons=np.array([r['season'] for r in rows]); target=1.5
prediction=np.full(len(rows),np.nan); masked_prediction=np.full(len(rows),np.nan); models=[]; folds=[]
def fit(x,y):
 center=x.mean(axis=0); scale=np.maximum(x.std(axis=0),.03); a=np.column_stack([np.ones(len(x)),(x-center)/scale]); penalty=np.eye(a.shape[1])*50; penalty[0,0]=.001
 coef=np.linalg.solve(a.T@a+penalty,a.T@y)
 for i in range(12):
  weight=1/np.maximum(1,np.abs(y-a@coef)); nxt=np.linalg.solve(a.T@(a*weight[:,None])+penalty,a.T@(y*weight))
  change=np.max(np.abs(nxt-coef)); coef=nxt
  if change<.0001:break
 return {'featureNames':names,'center':center.tolist(),'scale':scale.tolist(),'intercept':float(coef[0]),'coefficients':coef[1:].tolist(),'trainingRows':len(y),'iterations':i+1}
def predict(m,x):return np.clip(m['intercept']+((x-m['center'])/m['scale'])@np.array(m['coefficients']),0,48)
def metric(actual,pred):
 error=pred-actual; absolute=np.abs(error)
 return {'n':len(actual),'mae':float(absolute.mean()),'bias':float(error.mean()),'rmse':float(np.sqrt((error**2).mean())),'absoluteErrorP50':float(np.quantile(absolute,.5)),'absoluteErrorP80':float(np.quantile(absolute,.8)),'within1_5':float((absolute<=target).mean())}
for season in sorted(set(seasons)):
 if season<2020:continue
 train=np.flatnonzero(seasons<season); test=np.flatnonzero(seasons==season)
 earliest=min(rows[i]['forecastAt'] for i in test); train=np.array([i for i in train if rows[i]['settledAt']<earliest])
 train_x=X[train].copy(); mask=np.array([(int(rows[i]['eventId'])*31+int(rows[i]['playerId']))%2==0 for i in train]); train_x[mask]=masked[train][mask]
 m=fit(train_x,y[train]); m.update(season=int(season),trainedBefore=earliest,trainingLastSettledAt=max(rows[i]['settledAt'] for i in train)); p=predict(m,X[test]); mp=predict(m,masked[test]); prediction[test]=p; masked_prediction[test]=mp; models.append(m)
 folds.append({'season':int(season),'baseline':metric(y[test],baseline[test]),'candidate':metric(y[test],p),'starterMetadataMasked':metric(y[test],mp)})
 print(json.dumps({'season':int(season),'n':len(test),'baselineMAE':folds[-1]['baseline']['mae'],'candidateMAE':folds[-1]['candidate']['mae'],'maskedMAE':folds[-1]['starterMetadataMasked']['mae']}),flush=True)
eval_mask=(seasons>=2021)&np.isfinite(prediction); idx=np.flatnonzero(eval_mask)
cohorts=[]
for cohort in sorted(set(rows[i]['cohort'] for i in idx)):
 group=np.array([i for i in idx if rows[i]['cohort']==cohort]); cohorts.append({'cohort':cohort,'baseline':metric(y[group],baseline[group]),'candidate':metric(y[group],prediction[group]),'starterMetadataMasked':metric(y[group],masked_prediction[group])})
days=sorted(set(rows[i]['forecastAt'][:10] for i in idx)); sums=[]; counts=[]
for day in days:
 group=np.array([i for i in idx if rows[i]['forecastAt'][:10]==day]); sums.append(float((np.abs(prediction[group]-y[group])-np.abs(baseline[group]-y[group])).sum())); counts.append(len(group))
sums=np.array(sums); counts=np.array(counts); rng=np.random.default_rng(1529); draws=[]
for _ in range(1000):
 sample=rng.integers(0,len(days),len(days)); draws.append(float(sums[sample].sum()/counts[sample].sum()))
result={'generatedAt':datetime.now(timezone.utc).isoformat(),'version':'conditional-minute-learning-1','targetMAE':target,'protocol':{'evaluationSeasons':[2021,2022,2023,2024,2025,2026],'forecastHoursBeforeStart':1,'resultEmbargoHours':24,'model':'Fixed regularized robust median regression, 12 IRLS steps, 1-minute residual smoothing, ridge 50 on standardized features','starterMasking':'Deterministic half of training cases have prior starter metadata masked; evaluation reports both full and missing metadata','scope':'Conditional positive-minute appearances only; no current-game starter, injury, participation or result feature','status':'Reused historical research; not an untouched test'},'sourceSha256':data['sourceSha256'],'forecastSha256':data['forecastSha256'],'parametersSha256':data['parametersSha256'],'datasetSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'baseline':metric(y[idx],baseline[idx]),'candidate':metric(y[idx],prediction[idx]),'starterMetadataMasked':metric(y[idx],masked_prediction[idx]),'cohorts':cohorts,'folds':[f for f in folds if f['season']>=2021],'models':models,'uncertainty':{'method':'Paired UTC-forecast-day cluster bootstrap, candidate minus baseline minute absolute error','days':len(days),'draws':1000,'difference':float(sums.sum()/counts.sum()),'interval95':np.quantile(draws,[.025,.975]).tolist()},'promotion':{'passed':False,'targetMet':bool(np.abs(prediction[idx]-y[idx]).mean()<=target),'status':'Research only; final allocated minutes and points must be audited before deployment'},'limitations':['All eligible positive appearances remain in the headline cohort; stable starters are diagnostic, not a substitute headline.','These tests precede final team minute/score allocation and do not validate pregame participation or bookmaker props.','Prior starter fields are earlier postgame observations clearing the embargo, never target-game starters.','Source roster/injury timing remains unverified historically. All seasons have been inspected.']}
result['codeHashes']={str(f):hashlib.sha256((root/f).read_bytes()).hexdigest() for f in ['src/minute-features.js','scripts/prepare-minute-learning.js','scripts/research-minute-learning.py']}
result['validationExamples']=[{'season':int(seasons[i]),'features':rows[i]['x'],'prediction':float(prediction[i])} for i in idx[::max(1,len(idx)//12)][:12]]
(root/'minute-learning-artifact.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
with (root/'data/generated/minute-learning-predictions.ndjson').open('w') as f:
 for i in idx:f.write(json.dumps({'eventId':rows[i]['eventId'],'playerId':rows[i]['playerId'],'season':rows[i]['season'],'baseline':float(baseline[i]),'candidate':float(prediction[i]),'masked':float(masked_prediction[i]),'actual':float(y[i])})+'\n')
print(json.dumps({k:result[k] for k in ['baseline','candidate','cohorts','uncertainty','promotion']},indent=2),flush=True)
