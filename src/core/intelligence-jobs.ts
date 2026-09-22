import { PermanentJobError, type JobHandler } from './jobs';
import { buildWebsiteSnapshot, summarizeQa, validateSnapshot } from './discovery';
export interface DiscoveryProbeResult { url:string; routes:string[]; featureNames:string[]; technologies:string[]; }
export interface DiscoveryProbe { inspect(siteId:string,signal:AbortSignal):Promise<DiscoveryProbeResult>; }
export function createDiscoveryHandler(probe:DiscoveryProbe):JobHandler {
 return async(job,signal)=>{if(!job.siteId)throw new PermanentJobError('DISCOVERY_SITE_REQUIRED'); const raw=await probe.inspect(job.siteId,signal); const snapshot=buildWebsiteSnapshot({siteId:job.siteId,url:raw.url,capturedAt:new Date().toISOString(),routes:raw.routes,featureNames:raw.featureNames,technologies:raw.technologies,source:'crawl'}); const findings=validateSnapshot(snapshot); return {snapshot,findings,qa:summarizeQa(findings)};};
}
export interface QaSnapshotSource { load(siteId:string,signal:AbortSignal):Promise<{siteId:string;url:string;capturedAt:string;routes:string[];features:any[];technologies:string[]}>; }
export function createQaHandler(source:QaSnapshotSource):JobHandler {
 return async(job,signal)=>{if(!job.siteId)throw new PermanentJobError('QA_SITE_REQUIRED'); const snapshot=await source.load(job.siteId,signal); if(snapshot.siteId!==job.siteId)throw new PermanentJobError('QA_SITE_MISMATCH'); const findings=validateSnapshot(snapshot); return {siteId:job.siteId,capturedAt:new Date().toISOString(),findings,summary:summarizeQa(findings)};};
}
export function intelligenceHandlers(deps:{discovery:DiscoveryProbe;qa:QaSnapshotSource}):Record<string,JobHandler>{
 return {'recommendation.qa':createQaHandler(deps.qa),'website.discovery':createDiscoveryHandler(deps.discovery),'website.qa':createQaHandler(deps.qa)};
}
