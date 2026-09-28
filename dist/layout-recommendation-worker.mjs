import {recommendLayouts} from './layout-recommendations.mjs';
self.onmessage=({data})=>{try{const results=recommendLayouts(data.state,data.config,data.targets).map(({board,...r})=>r);self.postMessage({id:data.id,results});}catch(error){self.postMessage({id:data.id,error:error.message});}};
