import type { DashboardSnapshot } from './dashboard-repository';
export interface DashboardResponse { ok:true; data:DashboardSnapshot; }
export interface DashboardError { ok:false; code:'UNAUTHORIZED'|'SITE_NOT_FOUND'|'INVALID_SITE'; message:string; }
export function dashboardResponse(snapshot:DashboardSnapshot):DashboardResponse{return {ok:true,data:snapshot};}
export function validateDashboardSite(siteId:string|undefined):number|undefined{
 if(siteId===undefined||siteId==='')return undefined;
 if(!/^\d+$/.test(siteId))throw new Error('INVALID_SITE');
 const id=Number(siteId);
 if(!Number.isSafeInteger(id)||id<1)throw new Error('INVALID_SITE');
 return id;
}
