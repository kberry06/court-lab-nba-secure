"""Nonlinear role-regime experiment; fixed protocol, earlier-season training."""
import os,sys,json,hashlib
from pathlib import Path
from datetime import datetime,timezone
os.environ['OMP_NUM_THREADS']='2';os.environ['OPENBLAS_NUM_THREADS']='1'
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'data/generated/ml-libs'))
import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
protocol=json.loads((root/'experiments/minutes-45-v1.json').read_text(encoding='utf-8-sig'))
source=root/'data/generated/minute-regime-rows.json';data=json.loads(source.read_text(encoding='utf-8-sig'));rows=data['rows'];names=data['featureNames'];X=np.array([r['x'] for r in rows]);masked=np.array([r['masked'] for r in rows]);y=np.array([r['actual'] for r in rows]);baseline=np.array([r['baseline'] for r in rows]);seasons=np.array([r['season'] for r in rows]);pred=np.full(len(rows),np.nan);mpred=np.full(len(rows),np.nan);models=[];folds=[];examples=[]
def metric(ix,p):
 e=p-y[ix];return {'n':len(ix),'mae':float(np.abs(e).mean()),'bias':float(e.mean()),'rmse':float(np.sqrt((e*e).mean()))}
def export_model(m,season,cutoff,last,n):
 trees=[]
 for layer in m._predictors:
  tree=[]
  for a in layer[0].nodes:
   tree.append({'leaf':True,'value':float(a['value'])} if a['is_leaf'] else {'feature':int(a['feature_idx']),'threshold':float(a['num_threshold']),'left':int(a['left']),'right':int(a['right'])})
  trees.append(tree)
 return {'season':int(season),'featureNames':names,'baseline':float(m._baseline_prediction[0,0]),'trees':trees,'trainedBefore':cutoff,'trainingLastSettledAt':last,'trainingRows':n}
for season in sorted(set(seasons)):
 if season<2020:continue
 test=np.flatnonzero(seasons==season);cutoff=min(rows[i]['forecastAt'] for i in test);train=np.array([i for i in np.flatnonzero(seasons<season) if rows[i]['settledAt']<cutoff]);tx=X[train].copy();mask=np.array([(int(rows[i]['eventId'])*31+int(rows[i]['playerId']))%2==0 for i in train]);tx[mask]=masked[train][mask]
 m=HistGradientBoostingRegressor(**protocol['learner']).fit(tx,y[train]);p=np.clip(m.predict(X[test]),0,48);pm=np.clip(m.predict(masked[test]),0,48);pred[test]=p;mpred[test]=pm;model=export_model(m,season,cutoff,max(rows[i]['settledAt'] for i in train),len(train));models.append(model)
 for i in test[::max(1,len(test)//4)][:4]:examples.append({'season':int(season),'features':rows[i]['x'],'prediction':float(np.clip(m.predict(X[i:i+1])[0],0,48))})
 folds.append({'season':int(season),'baseline':metric(test,baseline[test]),'candidate':metric(test,p),'missingStarterMetadata':metric(test,pm)})
 print(json.dumps({'season':int(season),'cases':len(test),'baseline':folds[-1]['baseline']['mae'],'candidate':folds[-1]['candidate']['mae']}),flush=True)
idx=np.flatnonzero((seasons>=protocol['evaluationStarts'])&np.isfinite(pred));cohorts=[]
for cohort in sorted(set(rows[i]['cohort'] for i in idx)):
 ix=np.array([i for i in idx if rows[i]['cohort']==cohort]);cohorts.append({'cohort':cohort,'baseline':metric(ix,baseline[ix]),'candidate':metric(ix,pred[ix])})
artifact={'version':protocol['version'],'generatedAt':datetime.now(timezone.utc).isoformat(),'protocol':protocol,'libraryVersion':sklearn.__version__,'sourceHashes':{k:data[k] for k in ['sourceSha256','forecastSha256','parametersSha256']},'datasetSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'codeHashes':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['src/role-regime-features.js','scripts/prepare-minute-regimes.js','scripts/research-minute-regimes.py','experiments/minutes-45-v1.json']},'rawRole':{'baseline':metric(idx,baseline[idx]),'candidate':metric(idx,pred[idx]),'missingStarterMetadata':metric(idx,mpred[idx]),'cohorts':cohorts,'folds':[f for f in folds if f['season']>=protocol['evaluationStarts']]},'training':[{k:m[k] for k in ['season','trainedBefore','trainingLastSettledAt','trainingRows']} for m in models],'promotion':{'passed':False,'status':'Awaiting final-allocation audit; raw role errors are not the acceptance metric'}}
(root/'minute-regime-artifact.json').write_text(json.dumps(artifact,indent=2),encoding='utf-8')
(root/'data/generated/minute-regime-models.json').write_text(json.dumps({'models':models,'examples':examples},separators=(',',':')),encoding='utf-8')
print(json.dumps({'rawRole':artifact['rawRole']['candidate'],'cohorts':cohorts},indent=2),flush=True)
