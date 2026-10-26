import type {WebsiteScope,WebsiteSummary} from './workspace-journey';

export type ScopedWebsitePage={organization:{id:string};websites:WebsiteSummary[];nextCursor:string|null};
/** Cursor pages are independently tenant scoped by the server. Refuse inconsistent or repeated pages. */
export function appendScopedWebsitePage(scope:WebsiteScope|null,page:ScopedWebsitePage,seenCursors:Set<string>=new Set(),requestedCursor?:string){
 if(!page||typeof page.organization?.id!=='string'||!page.organization.id||!Array.isArray(page.websites)||page.websites.length>100||
   (scope&&scope.organizationId!==page.organization.id)||
   (requestedCursor&&seenCursors.has(requestedCursor))||
   (page.nextCursor!==null&&(typeof page.nextCursor!=='string'||!page.nextCursor||page.nextCursor===requestedCursor||seenCursors.has(page.nextCursor))))throw Error('WORKSPACE_PAGE_UNAVAILABLE');
 const websites=[...(scope?.websites??[]),...page.websites];
 if(new Set(websites.map(s=>s.id)).size!==websites.length||page.websites.some(s=>!s||typeof s.id!=='string'||!s.id||typeof s.domain!=='string'||!s.domain))throw Error('WORKSPACE_PAGE_UNAVAILABLE');
 return {organizationId:page.organization.id,websites};
}
/** A registry row may extend the shell selection only after its organization matches the current scope. */
export function includeScopedRegistryWebsite(scope:WebsiteScope,organizationId:string,site:WebsiteSummary):WebsiteScope{
 if(!scope.organizationId||organizationId!==scope.organizationId||!site?.id||!site.domain)throw Error('WORKSPACE_SCOPE_UNAVAILABLE');
 const existing=scope.websites.find(s=>s.id===site.id);
 if(existing&&existing.domain!==site.domain)throw Error('WORKSPACE_SCOPE_UNAVAILABLE');
 return existing?scope:{...scope,websites:[...scope.websites,site]};
}
