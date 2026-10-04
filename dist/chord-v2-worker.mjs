import {discoverChords} from './chord-discovery-v2.mjs';
import {createHarmonicJobDispatcher} from './harmonic-catalogue-jobs.mjs';
let generation=0;
const harmonicJobs=createHarmonicJobDispatcher({emit:message=>self.postMessage(message)});
self.onmessage=async({data})=>{
 if(data.kind){generation++;await harmonicJobs.dispatch(data);return;}
 harmonicJobs.cancel();const current=++generation;
 try{await discoverChords(data.state,data.config,result=>{if(current===generation)self.postMessage({request:data.request,...result});},()=>current!==generation);}
 catch(error){if(current===generation)self.postMessage({request:data.request,status:'error',message:error.message});}
};
