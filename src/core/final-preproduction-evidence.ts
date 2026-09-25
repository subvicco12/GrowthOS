export interface ResponsiveAdminEvidence { checkedAt:string; viewports:{width:number;height:number;navigationUsable:boolean;contentFits:boolean}[]; }
export interface ConnectorContractEvidence { checkedAt:string; transportValidated:boolean;authorizationSeparated:boolean;siteScoped:boolean;replayProtected:boolean; }
export interface GithubTraceabilityEvidence { checkedAt:string; commitSha:string; pullRequestNumber:number; ciRunId:number; ciPassed:boolean; }
export interface ExternalBlockerEvidence { integration:string;kind:'credential'|'authorization'|'account_verification'|'api_review'|'external_approval';missing:string;status:'needs_connection'; }

const validDate=(v:string)=>Number.isFinite(Date.parse(v));
export const hasResponsiveAdminEvidence=(e:ResponsiveAdminEvidence|undefined)=>!!e&&validDate(e.checkedAt)&&e.viewports.length>=3&&e.viewports.some(v=>v.width<=480)&&e.viewports.some(v=>v.width>=768&&v.width<1200)&&e.viewports.some(v=>v.width>=1200)&&e.viewports.every(v=>v.width>0&&v.height>0&&v.navigationUsable&&v.contentFits);
export const hasConnectorContractEvidence=(e:ConnectorContractEvidence|undefined)=>!!e&&validDate(e.checkedAt)&&e.transportValidated&&e.authorizationSeparated&&e.siteScoped&&e.replayProtected;
export const hasGithubTraceabilityEvidence=(e:GithubTraceabilityEvidence|undefined)=>!!e&&validDate(e.checkedAt)&&/^[0-9a-f]{7,40}$/i.test(e.commitSha)&&e.pullRequestNumber>0&&e.ciRunId>0&&e.ciPassed;
export const hasExternalBlockerEvidence=(e:ExternalBlockerEvidence[]|undefined)=>Array.isArray(e)&&e.every(b=>!!b.integration.trim()&&!!b.missing.trim()&&b.status==='needs_connection');
