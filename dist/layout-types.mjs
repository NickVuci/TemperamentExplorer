/** Shared recommendation contracts. Musical coordinates remain the app's [period,generator] pairs.
 * @typedef {[number,number]} Coordinate
 * @typedef {{melodic:number,baseMos:number,harmony:number,compactness:number,direction:number,pitch:number,reachability:number}} LayoutMetrics Normalized [0,1] scores.
 * @typedef {{coords:Coordinate[],variants?:Coordinate[][],kind?:string,exact:boolean,periodCopies:boolean,label:string,source:object,realization:object|null}} LayoutTarget Adapter around canonical material or realization; no new chord identity.
 * @typedef {{id:string,config:object,board:object}} LayoutCandidate Config is a projection of the canonical HexBoard configuration.
 * @typedef {{kind:string,represented:number,required:number,coverage:number,complete:boolean,occurrences:number,easyOccurrences:number,limited:boolean,best:object|null,diameter:number|null,totalDistance:number|null,compactness:number,harmony:number,voicingCount:number|null}} ChordLayoutMetrics
 * @typedef {LayoutCandidate & {score:number,metrics:LayoutMetrics,scale:object,chords:ChordLayoutMetrics[]}} LayoutRecommendation
 */
export {};
