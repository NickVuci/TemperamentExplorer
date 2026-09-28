// One transparent ranking, driven by the user's musical priorities. Sum = 1.
export const layoutWeights={direction:.25,baseMos:.20,melodic:.10,harmony:.16,compactness:.14,pitch:.12,reachability:.03};
export function layoutScore(metrics,hasTargets=true){let total=0,sum=0;for(const [name,w] of Object.entries(layoutWeights)){if(!hasTargets&&['harmony','compactness'].includes(name))continue;sum+=w;total+=w*metrics[name];}return total/sum;}
