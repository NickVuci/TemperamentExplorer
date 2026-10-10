import {createHarmonicJobDispatcher} from './harmonic-catalogue-jobs.mjs';
const harmonicJobs=createHarmonicJobDispatcher({emit:message=>self.postMessage(message)});
self.onmessage=({data})=>{void harmonicJobs.dispatch(data);};
