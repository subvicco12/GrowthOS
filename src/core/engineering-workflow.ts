export type EngineeringStage='recommendation'|'approval'|'issue'|'branch'|'code'|'test'|'pr'|'review'|'merge'|'deploy'|'verify'|'measure';
export interface EngineeringWorkItem { id:string; siteId:string; title:string; recommendationId?:string; stage:EngineeringStage; githubIssueUrl?:string; githubPrUrl?:string; commitSha?:string; deploymentId?:string; verificationId?:string; createdAt:string; updatedAt:string; }
const ORDER:EngineeringStage[]=['recommendation','approval','issue','branch','code','test','pr','review','merge','deploy','verify','measure'];
export function canAdvance(from:EngineeringStage,to:EngineeringStage):boolean{return ORDER.indexOf(to)===ORDER.indexOf(from)+1;}
export function advanceWorkItem(item:EngineeringWorkItem,to:EngineeringStage):EngineeringWorkItem{
 if(!canAdvance(item.stage,to))throw new Error('INVALID_ENGINEERING_STAGE_TRANSITION');
 return {...item,stage:to,updatedAt:new Date().toISOString()};
}
