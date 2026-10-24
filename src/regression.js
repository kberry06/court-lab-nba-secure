export const sigmoid=x=>1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));
export const logit=p=>Math.log(Math.max(1e-6,Math.min(1-1e-6,p))/(1-Math.max(1e-6,Math.min(1-1e-6,p))));
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
function solve(matrix,rhs){
 const a=matrix.map((r,i)=>[...r,rhs[i]]),n=rhs.length;
 for(let j=0;j<n;j++){let pivot=j;for(let i=j+1;i<n;i++)if(Math.abs(a[i][j])>Math.abs(a[pivot][j]))pivot=i;[a[j],a[pivot]]=[a[pivot],a[j]];if(Math.abs(a[j][j])<1e-10)a[j][j]=1e-10;const d=a[j][j];for(let k=j;k<=n;k++)a[j][k]/=d;for(let i=0;i<n;i++)if(i!==j){const f=a[i][j];for(let k=j;k<=n;k++)a[i][k]-=f*a[j][k];}}
 return a.map(r=>r[n]);
}
export function fitRegression(rows,featureNames,{target='y',logistic=false,ridge=10}={}){
 if(!rows.length)throw new Error('Training rows required');
 const names=[...featureNames],x=rows.map(r=>[1,...names.map(k=>r.features[k])]),y=rows.map(r=>r[target]),n=names.length+1;
 if(x.some(r=>r.some(v=>!Number.isFinite(v)))||y.some(v=>!Number.isFinite(v)))throw new Error('Non-finite training input');
 let coefficients=Array(n).fill(0);
 for(let iteration=0;iteration<(logistic?12:1);iteration++){
  const h=Array.from({length:n},()=>Array(n).fill(0)),gradient=Array(n).fill(0);
  for(let i=0;i<x.length;i++){const prediction=logistic?sigmoid(dot(x[i],coefficients)):0,w=logistic?Math.max(1e-5,prediction*(1-prediction)):1,e=y[i]-prediction;for(let j=0;j<n;j++){gradient[j]+=x[i][j]*e;for(let k=0;k<=j;k++)h[j][k]+=w*x[i][j]*x[i][k];}}
  for(let j=0;j<n;j++){const penalty=j===0?.01:ridge;h[j][j]+=penalty;gradient[j]-=penalty*coefficients[j];for(let k=0;k<j;k++)h[k][j]=h[j][k];}
  const delta=solve(h,gradient);coefficients=coefficients.map((v,i)=>v+delta[i]);if(Math.max(...delta.map(Math.abs))<1e-7)break;
 }
 return {featureNames:names,coefficients,logistic,trainingRows:rows.length};
}
export function predictRegression(model,features){const x=[1,...model.featureNames.map(k=>features[k])];if(x.some(v=>!Number.isFinite(v)))throw new Error('Non-finite projection feature');const value=dot(x,model.coefficients);return model.logistic?sigmoid(value):value;}
