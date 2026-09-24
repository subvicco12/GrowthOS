import { PostgresDashboardRepository, buildDashboardSnapshot, type DashboardSnapshot, type DashboardSql } from './dashboard-repository';
import { validateDashboardSite } from './dashboard-api';
export class DashboardService {
 constructor(private readonly repository:PostgresDashboardRepository){}
 async get(siteId?:string):Promise<DashboardSnapshot>{ validateDashboardSite(siteId); const query=await this.repository.load(siteId); return buildDashboardSnapshot(query); }
}
export interface DashboardRoute {
 get(siteId?:string):Promise<{status:200;body:{ok:true;data:DashboardSnapshot}}|{status:400;body:{ok:false;code:'INVALID_SITE';message:string}}>;
}
export function createDashboardRoute(service:DashboardService):DashboardRoute{
 return {get:async(siteId)=>{try{return {status:200,body:{ok:true,data:await service.get(siteId)}}}catch(error){if(error instanceof Error&&error.message==='INVALID_SITE')return {status:400,body:{ok:false,code:'INVALID_SITE',message:error.message}};throw error;}}};
}
