import type { DashboardSnapshot } from './dashboard-repository';
export interface DashboardResponse { ok:true; data:DashboardSnapshot; }
export interface DashboardError { ok:false; code:'UNAUTHORIZED'|'SITE_NOT_FOUND'|'INVALID_SITE'; message:string; }
export function dashboardResponse(snapshot:DashboardSnapshot):DashboardResponse{return {ok:true,data:snapshot};}
export function validateDashboardSite(siteId:string|undefined):void{
 if(siteId!==undefined&&!/^[0-9a-fA-F-]{36}$/.test(siteId))throw new Error('INVALID_SITE');
}
