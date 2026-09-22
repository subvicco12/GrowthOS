import type { JobHandler } from './jobs';
import { comparePackages, validateCompetitor, type CompetitorProfile, type PackageInventory } from './competitive-intelligence';
import { packageGapsToOpportunities } from './opportunities';
export interface CompetitorSource { collect(siteId:string,signal:AbortSignal):Promise<{ours:PackageInventory;competitors:CompetitorProfile[]}>; }
export function createCompetitorHandler(source:CompetitorSource):JobHandler {
 return async(job,signal)=>{
  if(!job.siteId)throw new Error('COMPETITOR_SITE_REQUIRED');
  const data=await source.collect(job.siteId,signal);
  const valid:CompetitorProfile[]=[]; const rejected:{domain:string;issues:string[]}[]=[];
  for(const c of data.competitors){const issues=validateCompetitor(c);if(issues.length)rejected.push({domain:c.domain,issues});else valid.push(c);}
  const gaps=comparePackages(data.ours,valid);
  const opportunities=packageGapsToOpportunities(job.siteId,gaps);
  return {siteId:job.siteId,capturedAt:new Date().toISOString(),competitorsAccepted:valid.length,competitorsRejected:rejected.length,rejected,gaps,opportunities};
 };
}
export function competitorHandlers(source:CompetitorSource):Record<string,JobHandler>{return {'competitor.refresh':createCompetitorHandler(source),'packaging.compare':createCompetitorHandler(source)};}
