import type { GrowthSiteDefinition } from './portfolio';
export interface SiteScope { siteId?:string; domain?:string; }
export function resolveSiteScope(sites:readonly GrowthSiteDefinition[],siteId:string|undefined):GrowthSiteDefinition|undefined{
 if(!siteId)return undefined;
 return sites.find(site=>site.domain===siteId);
}
export function siteScopeOptions(sites:readonly GrowthSiteDefinition[]):Array<{value:string;label:string}>{
 return [{value:'',label:'All websites'},...sites.map(site=>({value:site.domain,label:site.name}))];
}
