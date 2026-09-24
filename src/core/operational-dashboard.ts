export interface OperationalCounts { needsApproval:number; inDevelopment:number; inProduction:number; qaFailed:number; readyForReview:number; readyForListing:number; readyToPublish:number; live:number; exceptions:number; activeJobs:number; }
export interface IntegrationHealth { name:string; status:'healthy'|'attention'|'disabled'; detail:string; }
export interface GrowthDashboardModel { counts:OperationalCounts; integrations:IntegrationHealth[]; nextBestActions:string[]; recentActivity:string[]; }
export const emptyOperationalCounts=():OperationalCounts=>({needsApproval:0,inDevelopment:0,inProduction:0,qaFailed:0,readyForReview:0,readyForListing:0,readyToPublish:0,live:0,exceptions:0,activeJobs:0});
export function buildOperationalDashboard(input:Partial<GrowthDashboardModel>={}):GrowthDashboardModel {
 return {counts:{...emptyOperationalCounts(),...(input.counts??{})},integrations:input.integrations??[],nextBestActions:(input.nextBestActions??[]).slice(0,5),recentActivity:(input.recentActivity??[]).slice(0,10)};
}
