import {discoverChords} from './chord-discovery-v2.mjs';
let generation=0;
self.onmessage=async({data})=>{const current=++generation;try{await discoverChords(data.state,data.config,result=>{if(current===generation)self.postMessage({request:data.request,...result});},()=>current!==generation);}catch(error){self.postMessage({request:data.request,status:'error',message:error.message});}};
