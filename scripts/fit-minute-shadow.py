"""Fit a frozen shadow model on all available completed historical seasons."""
import os,sys,json,hashlib
from pathlib import Path
from datetime import datetime,timezone
os.environ['OMP_NUM_THREADS']='2';os.environ['OPENBLAS_NUM_THREADS']='1'
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'data/generated/ml-libs'))
import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
source=root/'data/generated/minute-regime-rows.json';data=json.loads(source.read_text());rows=data['rows'];names=data['featureNames'];x=np.array([r['x'] for r in rows]);masked=np.array([r['masked'] for r in rows]);y=np.array([r['actual'] for r in rows]);p=json.loads((root/'experiments/minutes-45-v1.json').read_text(encoding='utf-8-sig'))
mask=np.array([(int(r['eventId'])*31+int(r['playerId']))%2==0 for r in rows]);x[mask]=masked[mask];m=HistGradientBoostingRegressor(**p['learner']).fit(x,y);trees=[]
for layer in m._predictors:trees.append([{'leaf':True,'value':float(a['value'])} if a['is_leaf'] else {'feature':int(a['feature_idx']),'threshold':float(a['num_threshold']),'left':int(a['left']),'right':int(a['right'])} for a in layer[0].nodes])
ix=np.arange(0,len(x),max(1,len(x)//20))[:20];native=np.clip(m.predict(x[ix]),0,48)
a={'version':'minute-shadow-balanced-1','shadowOnly':True,'acceptanceTarget':4.5,'historicalGatePassed':False,'generatedAt':datetime.now(timezone.utc).isoformat(),'trainingLastSettledAt':max(r['settledAt'] for r in rows),'trainingRows':len(rows),'libraryVersion':sklearn.__version__,'sourceSha256':data['sourceSha256'],'datasetSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'model':{'featureNames':names,'baseline':float(m._baseline_prediction[0,0]),'trees':trees},'runtimeExamples':[{'features':dict(zip(names,x[i].tolist())),'expected':float(v)} for i,v in zip(ix,native)],'limitations':['Research shadow only; no live/default model promotion','Runtime examples verify serialization, not out-of-sample accuracy','Earlier historical roster proxies differ from the current public-data feed; prospective comparisons are required']}
(root/'minute-shadow-model.json').write_text(json.dumps(a,separators=(',',':')),encoding='utf-8');print(json.dumps({k:a[k] for k in ['version','trainingRows','trainingLastSettledAt']}),flush=True)
