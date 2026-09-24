import type { GrowthSiteDefinition } from './portfolio';
export interface SiteScope { siteId?:string; domain?:string; }
const productionSiteIds:Record<string,string>={'priceinsight360.com':'1','barcodeqrhub.com':'2','businessstarttools.com':'3','aitoolstores.com':'4','pdfimagetools.online':'5','calcumint.com':'6'};
export function resolveSiteScope(sites:readonly GrowthSiteDefinition[],siteId:string|undefined):GrowthSiteDefinition|undefined{
 if(!siteId)return undefined;
 return sites.find(site=>(productionSiteIds[site.domain]??site.domain)===siteId);
}
export function siteScopeOptions(sites:readonly GrowthSiteDefinition[]):Array<{value:string;label:string}>{
 return sites.map(site=>({value:productionSiteIds[site.domain]??site.domain,label:site.name}));
}
