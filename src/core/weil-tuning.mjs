// Shared by tuning controls and the built-in catalog.
import {purePeriod} from './pitch.mjs';
export function weilTune(s,constrained=false,fixedPeriod=purePeriod(s)){
 // Dual Weil–Euclidean metric: z·z - (sum z)^2/(d+1),
 // where z_i is the cents error of prime i divided by log2(prime i).
 const d=s.basis.length,logs=s.basis.map(Math.log2),a=s.rows[0].map((v,i)=>v/logs[i]),b=s.rows[1].map((v,i)=>v/logs[i]),j=logs.map(()=>1200);
 const sum=x=>x.reduce((t,v)=>t+v,0),dot=(x,y)=>x.reduce((t,v,i)=>t+v*y[i],0)-sum(x)*sum(y)/(d+1);
 const aa=dot(a,a),ab=dot(a,b),bb=dot(b,b),aj=dot(a,j),bj=dot(b,j);let p,g;
 if(constrained){if(!(bb>0))throw Error('This mapping does not constrain a generator.');p=fixedPeriod;g=(bj-p*ab)/bb;}
 else{const det=aa*bb-ab*ab;if(!(det>1e-13*aa*bb))throw Error('This mapping is too ill-conditioned to solve WE reliably.');p=(aj*bb-bj*ab)/det;g=(bj*aa-aj*ab)/det;}
 if(!Number.isFinite(p)||!Number.isFinite(g)||p<purePeriod(s)/2||p>purePeriod(s)*2||g<=0||g>=p)throw Error('The WE optimum lies outside this prototype’s supported period/generator range. Choose another generator basis; the result has not been clipped.');
 return {p,g};
}
