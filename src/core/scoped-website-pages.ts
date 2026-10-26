import type {WebsiteScope,WebsiteSummary} from './workspace-journey';
import {websiteDomainSchema} from './website-domain-schema';

export type ScopedWebsitePage={organization:{id:string;name?:string;role?:string};websites:WebsiteSummary[];nextCursor:string|null};
export class WebsiteScopeError extends Error { constructor(message='WORKSPACE_SCOPE_UNAVAILABLE'){super(message);} }
export class WebsitePageAccessError extends Error { constructor(public readonly status:401|403){super(status===401?'Session expired. Sign in again to continue.':'Permission denied. Select an authorized workspace or ask an owner for access.');} }
const cursorPattern=/^[A-Za-z0-9_-]{1,768}$/;
const idPattern=/^[A-Za-z0-9_-]{1,128}$/;
export function parseScopedWebsitePage(raw:unknown):ScopedWebsitePage {
 if(!raw||typeof raw!=='object')throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');
 const page=raw as Record<string,unknown>,org=page.organization as Record<string,unknown>|null;
 if(!org||typeof org.id!=='string'||!idPattern.test(org.id)||!Array.isArray(page.websites)||page.websites.length>25||
   (page.nextCursor!==null&&(typeof page.nextCursor!=='string'||!cursorPattern.test(page.nextCursor))))throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');
 const websites:WebsiteSummary[]=[];
 for(const item of page.websites){
   if(!item||typeof item!=='object')throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');
   const s=item as Record<string,unknown>;
   if(typeof s.id!=='string'||!idPattern.test(s.id)||typeof s.domain!=='string'||!websiteDomainSchema.safeParse(s.domain).success||s.domain!==s.domain.toLowerCase().trim()||
     typeof s.platform!=='string'||!s.platform||typeof s.status!=='string'||!s.status||
     typeof s.automationEnabled!=='boolean'||typeof s.autoPublishEnabled!=='boolean'||
     typeof s.monthlyBudgetMinor!=='string'||!/^(0|[1-9]\d{0,19})$/.test(s.monthlyBudgetMinor)||
     (s.verifiedAt!==null&&(typeof s.verifiedAt!=='string'||!Number.isFinite(Date.parse(s.verifiedAt)))))throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');
   websites.push(s as WebsiteSummary);
 }
 if(websites.length===0&&page.nextCursor!==null)throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');
 return {organization:org as ScopedWebsitePage['organization'],websites,nextCursor:page.nextCursor as string|null};
}
/** Cursor pages are independently tenant scoped by the server. Refuse inconsistent or repeated pages. */
export function appendScopedWebsitePage(scope:WebsiteScope|null,raw:unknown,seenCursors:Set<string>=new Set(),requestedCursor?:string){
 const page=parseScopedWebsitePage(raw);
 if((scope&&scope.organizationId!==page.organization.id)||(requestedCursor&&seenCursors.has(requestedCursor))||
   (page.nextCursor!==null&&(page.nextCursor===requestedCursor||seenCursors.has(page.nextCursor))))throw new WebsiteScopeError();
 const websites=[...(scope?.websites??[]),...page.websites];
 const identities=new Map<string,string>();
 for(const site of websites){if(identities.has(site.id))throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');identities.set(site.id,site.domain);}
 return {organizationId:page.organization.id,websites};
}
/** A registry row may extend the shell selection only after its organization matches the current scope. */
export function includeScopedRegistryWebsite(scope:WebsiteScope,organizationId:string,site:WebsiteSummary):WebsiteScope{
 const verified=parseScopedWebsitePage({organization:{id:organizationId},websites:[site],nextCursor:null});
 if(!scope.organizationId||verified.organization.id!==scope.organizationId)throw new WebsiteScopeError();
 const existing=scope.websites.find(s=>s.id===site.id);
 if(existing&&existing.domain!==site.domain)throw new WebsiteScopeError();
 return existing?scope:{...scope,websites:[...scope.websites,site]};
}
export type WebsitePageState={scope:WebsiteScope|null;organization:ScopedWebsitePage['organization']|null;nextCursor:string|null;busy:boolean;error:string|null;fatal:boolean};
export class ScopedWebsitePager {
 private state:WebsitePageState={scope:null,organization:null,nextCursor:null,busy:false,error:null,fatal:false};
 private generation=0;
 private request:AbortController|null=null;
 private seen=new Set<string>();
 constructor(private readonly fetchPage:(cursor:string|null,signal:AbortSignal)=>Promise<unknown>,private readonly changed:(state:WebsitePageState)=>void=()=>{}){}
 get snapshot(){return this.state;}
 private publish(next:WebsitePageState){this.state=next;this.changed(next);}
 invalidate(){this.generation++;this.request?.abort();this.request=null;this.seen.clear();this.publish({scope:null,organization:null,nextCursor:null,busy:false,error:null,fatal:false});}
 dispose(){this.generation++;this.request?.abort();this.request=null;this.seen.clear();}
 updateSite(id:string,update:(site:WebsiteSummary)=>WebsiteSummary){if(!this.state.scope)return false;
  const original=this.state.scope.websites.find(s=>s.id===id);if(!original)return false;
  const changed=update(original);if(changed.id!==id||changed.domain!==original.domain)throw new WebsiteScopeError();
  this.publish({...this.state,scope:{...this.state.scope,websites:this.state.scope.websites.map(s=>s.id===id?changed:s)}});return true;
 }
 failClosed(message='WORKSPACE_SCOPE_UNAVAILABLE'){this.generation++;this.request?.abort();this.request=null;this.seen.clear();this.publish({scope:null,organization:null,nextCursor:null,busy:false,error:message,fatal:true});}
 async loadInitial(){this.invalidate();return this.load(null);}
 async refresh(){this.generation++;this.request?.abort();this.request=null;this.seen.clear();this.publish({...this.state,busy:false});return this.load(null);}
 async loadMore(){if(!this.state.scope||!this.state.nextCursor||this.state.busy||this.state.fatal)return false;return this.load(this.state.nextCursor);}
 private async load(cursor:string|null){
  if(this.state.busy)return false;
  const generation=this.generation,controller=new AbortController();this.request=controller;this.publish({...this.state,busy:true,error:null});
  try{const raw=await this.fetchPage(cursor,controller.signal);if(generation!==this.generation||controller.signal.aborted)return false;
   const page=parseScopedWebsitePage(raw);
   if(cursor&&this.state.organization&&((this.state.organization.role&&page.organization.role!==this.state.organization.role)||
      (this.state.organization.name&&page.organization.name!==this.state.organization.name)))throw new WebsiteScopeError();
   const scope=appendScopedWebsitePage(cursor?this.state.scope:null,page,this.seen,cursor??undefined);
   if(cursor)this.seen.add(cursor);
   this.publish({scope,organization:page.organization,nextCursor:page.nextCursor,busy:false,error:null,fatal:false});return true;
  }catch(error){if(generation!==this.generation||controller.signal.aborted)return false;
   const fatal=error instanceof WebsitePageAccessError||error instanceof WebsiteScopeError;
   const message=error instanceof Error?error.message:'Website portfolio unavailable. Try again.';
   if(fatal){this.seen.clear();this.publish({scope:null,organization:null,nextCursor:null,busy:false,error:message,fatal:true});}
   else this.publish({...this.state,busy:false,error:message,fatal:false});
   return false;
  }finally{if(this.request===controller)this.request=null;}
 }
}

export const MAX_WEBSITE_PAGE_BYTES=128*1024;
/** Bound server response bytes before JSON decoding, including chunked responses. */
export async function readScopedWebsiteResponse(response:Response):Promise<unknown>{
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_WEBSITE_PAGE_BYTES))throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');
 if(!response.body)throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>MAX_WEBSITE_PAGE_BYTES)throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');chunks.push(value);
 }}catch(error){await reader.cancel().catch(()=>{});throw error;}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}
 catch{throw new WebsiteScopeError('WORKSPACE_PAGE_UNAVAILABLE');}
}
