import { dedupePageUrls } from './url-normalization';

export type DiscoverySource='connector'|'crawl'|'manual';
export type DiscoveryConfidence='high'|'medium'|'low';
export interface DiscoveredFeature { key:string; name:string; evidence:string[]; source:DiscoverySource; confidence:DiscoveryConfidence; }
export interface WebsiteSnapshot { siteId:string; url:string; capturedAt:string; routes:string[]; features:DiscoveredFeature[]; technologies:string[]; }
const normalize=(value:string)=>value.trim().replace(/\s+/g,' ');
export function buildWebsiteSnapshot(input:{siteId:string;url:string;capturedAt:string;routes?:string[];featureNames?:string[];technologies?:string[];source?:DiscoverySource}):WebsiteSnapshot {
 const routes=dedupePageUrls((input.routes??[]).map(normalize).filter(Boolean)).slice(0,10000);
 const source=input.source??'crawl';
 const features=[...new Set((input.featureNames??[]).map(normalize).filter(Boolean))].slice(0,5000).map((name,index)=>({key:`discovered-${index+1}`,name,evidence:[],source,confidence:'medium' as const}));
 return {siteId:input.siteId,url:input.url,capturedAt:input.capturedAt,routes,features,technologies:[...new Set((input.technologies??[]).map(normalize).filter(Boolean))].slice(0,500)};
}
export interface QaFinding { id:string; category:'availability'|'content'|'navigation'|'security'|'performance'|'accessibility'; severity:'critical'|'high'|'medium'|'low'; title:string; evidence:string; }
export interface QaSummary { total:number; critical:number; high:number; medium:number; low:number; score:number; }
export function summarizeQa(findings:QaFinding[]):QaSummary {
 const count=(s:QaFinding['severity'])=>findings.filter(f=>f.severity===s).length;
 const critical=count('critical'),high=count('high'),medium=count('medium'),low=count('low');
 const penalty=critical*30+high*15+medium*6+low*2;
 return {total:findings.length,critical,high,medium,low,score:Math.max(0,100-penalty)};
}
export function validateSnapshot(snapshot:WebsiteSnapshot):QaFinding[] {
 const findings:QaFinding[]=[];
 if(!snapshot.routes.length)findings.push({id:'no-routes',category:'navigation',severity:'high',title:'No routes discovered',evidence:'Website discovery returned zero routes.'});
 if(!snapshot.features.length)findings.push({id:'no-features',category:'content',severity:'medium',title:'No product features discovered',evidence:'Feature inventory is empty and requires connector, crawl, or manual evidence.'});
 if(!/^https:\/\//i.test(snapshot.url))findings.push({id:'https-required',category:'security',severity:'critical',title:'HTTPS is required',evidence:snapshot.url});
 return findings;
}
