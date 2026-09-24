import type { DashboardSnapshot } from './dashboard-repository';
export function dashboardJson(snapshot:DashboardSnapshot){return {ok:true as const,data:snapshot};}
export function parseSiteScope(value:string|null|undefined):string|undefined{
 const normalized=value?.trim(); return normalized||undefined;
}
