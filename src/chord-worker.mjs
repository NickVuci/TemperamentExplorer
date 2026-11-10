import {createHarmonicJobDispatcher} from './harmonic/harmonic-catalogue-jobs.mjs';
import {createShapeJobDispatcher} from './shapes/shape-jobs.mjs';
const harmonicJobs = createHarmonicJobDispatcher({emit: message => self.postMessage(message)});
const shapeJobs = createShapeJobDispatcher({emit: message => self.postMessage(message)});
self.onmessage = ({data}) => {
  if (data?.kind === 'cancel') {
    void harmonicJobs.dispatch(data);
    void shapeJobs.dispatch(data);
  } else void (data?.kind?.startsWith('shape-') ? shapeJobs : harmonicJobs).dispatch(data);
};
