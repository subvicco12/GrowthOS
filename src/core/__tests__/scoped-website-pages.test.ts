import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendScopedWebsitePage,includeScopedRegistryWebsite} from '../scoped-website-pages';
import {requireSelectedWebsite,type WebsiteSummary} from '../workspace-journey';
const site=(i:number):WebsiteSummary=>({id:`site-${i}`,domain:`site-${i}.example`,status:'draft',platform:'wordpress',verifiedAt:null,automationEnabled:false,autoPublishEnabled:false,monthlyBudgetMinor:'0'});
test('cursor pages extend a tenant-scoped portfolio without a navigation ceiling',()=>{
 let scope=appendScopedWebsitePage(null,{organization:{id:'org-a'},websites:Array.from({length:25},(_,i)=>site(i)),nextCursor:'second'});
 scope=appendScopedWebsitePage(scope,{organization:{id:'org-a'},websites:Array.from({length:25},(_,i)=>site(i+25)),nextCursor:'third'},new Set(),'second');
 scope=appendScopedWebsitePage(scope,{organization:{id:'org-a'},websites:Array.from({length:25},(_,i)=>site(i+50)),nextCursor:null},new Set(['second']),'third');
 assert.equal(scope.websites.length,75);assert.equal(requireSelectedWebsite(scope,'site-74').domain,'site-74.example');
});
test('paging and registry handoff refuse cross-tenant, duplicate and looping selection',()=>{
 const initial=appendScopedWebsitePage(null,{organization:{id:'org-a'},websites:[site(1)],nextCursor:'next'});
 assert.throws(()=>appendScopedWebsitePage(initial,{organization:{id:'org-b'},websites:[site(2)],nextCursor:null}),/SCOPE_UNAVAILABLE/);
 assert.throws(()=>appendScopedWebsitePage(initial,{organization:{id:'org-a'},websites:[site(1)],nextCursor:null}),/(PAGE|SCOPE)_UNAVAILABLE/);
 assert.throws(()=>appendScopedWebsitePage(initial,{organization:{id:'org-a'},websites:[site(2)],nextCursor:'next'},new Set(),'next'),/(PAGE|SCOPE)_UNAVAILABLE/);
 assert.throws(()=>appendScopedWebsitePage(initial,{organization:{id:'org-a'},websites:[site(2)],nextCursor:'old'},new Set(['old']),'next'),/(PAGE|SCOPE)_UNAVAILABLE/);
 assert.throws(()=>includeScopedRegistryWebsite(initial,'org-b',site(2)),/SCOPE_UNAVAILABLE/);
 assert.throws(()=>includeScopedRegistryWebsite(initial,'org-a',{...site(1),domain:'forged.example'}),/SCOPE_UNAVAILABLE/);
 const extended=includeScopedRegistryWebsite(initial,'org-a',site(2));assert.equal(requireSelectedWebsite(extended,'site-2').domain,'site-2.example');
 assert.equal(includeScopedRegistryWebsite(extended,'org-a',site(2)),extended);
});

import {ScopedWebsitePager,WebsitePageAccessError} from '../scoped-website-pages';
const page=(org:string,start:number,count:number,nextCursor:string|null)=>({organization:{id:org,name:'Workspace',role:'admin'},websites:Array.from({length:count},(_,i)=>site(start+i)),nextCursor});
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('more than 1,000 sites retain exact scope across 41 bounded cursor pages',()=>{
 let scope=null as ReturnType<typeof appendScopedWebsitePage>|null;
 const visited=new Set<string>();
 for(let n=0;n<41;n++){
   const cursor=n?`cursor${n}`:undefined;
   scope=appendScopedWebsitePage(scope,page('org-a',n*25,25,n<40?`cursor${n+1}`:null),visited,cursor);
   if(cursor)visited.add(cursor);
 }
 assert.equal(scope!.websites.length,1025);assert.equal(requireSelectedWebsite(scope!,'site-1024').domain,'site-1024.example');
});
test('malformed records, empty looping pages and inconsistent metadata fail closed',()=>{
 for(const raw of [null,{},page('org-a',0,26,null),{...page('org-a',0,0,'next')},
   {...page('org-a',0,1,null),websites:[{...site(1),automationEnabled:'true'}]},
   {...page('org-a',0,1,null),websites:[{...site(1),verifiedAt:'not a date'}]},
   {...page('org-a',0,1,null),nextCursor:'bad cursor'},
   {...page('org-a',0,1,null),websites:[{...site(1),id:'<script>'}]},
 ])assert.throws(()=>appendScopedWebsitePage(null,raw),/(PAGE|SCOPE)_UNAVAILABLE/);
 const first=appendScopedWebsitePage(null,page('org-a',0,1,'next'));
 assert.throws(()=>appendScopedWebsitePage(first,{...page('org-a',1,1,null),websites:[{...site(0),domain:'changed.example'}]},new Set(),'next'),/(PAGE|SCOPE)_UNAVAILABLE/);
});
test('recoverable page failure preserves selection, cursor and rows; retry advances exactly once',async()=>{
 let attempts=0;const pager=new ScopedWebsitePager(async cursor=>{
  if(!cursor)return page('org-a',0,25,'next');
  attempts++;if(attempts===1)throw Error('Temporary service failure');return page('org-a',25,25,null);
 });
 assert.equal(await pager.loadInitial(),true);const before=pager.snapshot.scope!;
 assert.equal(await pager.loadMore(),false);assert.equal(pager.snapshot.scope,before);assert.equal(pager.snapshot.nextCursor,'next');
 assert.equal(requireSelectedWebsite(pager.snapshot.scope!,'site-24').id,'site-24');
 assert.equal(pager.snapshot.fatal,false);
 assert.equal(await pager.loadMore(),true);assert.equal(pager.snapshot.scope!.websites.length,50);assert.equal(attempts,2);
});
test('concurrent loads are bounded; invalidation ignores late responses after organization change',async()=>{
 const waiting=deferred<unknown>();let calls=0;
 const pager=new ScopedWebsitePager(async cursor=>{calls++;return cursor?waiting.promise:page('org-a',0,1,'next');});
 await pager.loadInitial();const pending=pager.loadMore();assert.equal(await pager.loadMore(),false);assert.equal(calls,2);
 pager.invalidate();waiting.resolve(page('org-a',1,1,null));assert.equal(await pending,false);assert.equal(pager.snapshot.scope,null);
 const old=deferred<unknown>(),newer=deferred<unknown>();let first=true;
 const switched=new ScopedWebsitePager(async()=>first?(first=false,old.promise):newer.promise);
 const oldLoad=switched.loadInitial();switched.invalidate();const newLoad=switched.loadInitial();
 old.resolve(page('org-a',0,1,null));newer.resolve(page('org-b',10,1,null));
 assert.equal(await oldLoad,false);assert.equal(await newLoad,true);assert.equal(switched.snapshot.scope!.organizationId,'org-b');
});
test('401, 403, role changes and cross-tenant pages erase the previously loaded scope',async()=>{
 for(const failure of [new WebsitePageAccessError(401),new WebsitePageAccessError(403)]){
  const pager=new ScopedWebsitePager(async cursor=>cursor?Promise.reject(failure):page('org-a',0,1,'next'));
  await pager.loadInitial();assert.equal(await pager.loadMore(),false);assert.equal(pager.snapshot.scope,null);assert.equal(pager.snapshot.fatal,true);
 }
 for(const second of [page('org-b',1,1,null),{...page('org-a',1,1,null),organization:{id:'org-a',name:'Workspace',role:'viewer'}}]){
  const pager=new ScopedWebsitePager(async cursor=>cursor?second:page('org-a',0,1,'next'));
  await pager.loadInitial();assert.equal(await pager.loadMore(),false);assert.equal(pager.snapshot.scope,null);assert.equal(pager.snapshot.fatal,true);
 }
});
test('registry response can update a verified site without discarding other pages or local profile identity',async()=>{
 const pager=new ScopedWebsitePager(async cursor=>cursor?page('org-a',25,1,null):page('org-a',0,25,'next'));
 await pager.loadInitial();await pager.loadMore();
 const scope=pager.snapshot.scope!,selected=requireSelectedWebsite(scope,'site-25');
 assert.equal(pager.updateSite('site-25',site=>({...site,automationEnabled:false})),true);
 assert.equal(pager.snapshot.scope!.websites.length,26);assert.equal(pager.snapshot.nextCursor,null);
 assert.equal(selected.id,requireSelectedWebsite(pager.snapshot.scope!,'site-25').id);
 assert.throws(()=>pager.updateSite('site-25',site=>({...site,domain:'wrong.example'})),/SCOPE_UNAVAILABLE/);
});
import {MAX_WEBSITE_PAGE_BYTES,readScopedWebsiteResponse} from '../scoped-website-pages';
test('bounded page decoder rejects invalid JSON, invalid UTF-8 and oversized chunked responses',async()=>{
 const good=JSON.stringify(page('org-a',0,1,null));
 assert.deepEqual(await readScopedWebsiteResponse(new Response(good)),JSON.parse(good));
 await assert.rejects(readScopedWebsiteResponse(new Response('{broken')),/PAGE_UNAVAILABLE/);
 await assert.rejects(readScopedWebsiteResponse(new Response(new Uint8Array([0xff]))),/PAGE_UNAVAILABLE/);
 await assert.rejects(readScopedWebsiteResponse(new Response(good,{headers:{'Content-Length':String(MAX_WEBSITE_PAGE_BYTES+1)}})),/PAGE_UNAVAILABLE/);
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(70000));controller.enqueue(new Uint8Array(70000));controller.close();}}));
 await assert.rejects(readScopedWebsiteResponse(response),/PAGE_UNAVAILABLE/);
});
test('refresh failure retains validated rows and cursor until a safe retry succeeds',async()=>{
 let fail=false;
 const pager=new ScopedWebsitePager(async cursor=>{
   if(cursor)return page('org-a',25,1,null);
   if(fail)throw Error('Network unavailable');
   return page('org-a',0,25,'next');
 });
 await pager.loadInitial();await pager.loadMore();const previous=pager.snapshot.scope!;
 fail=true;assert.equal(await pager.refresh(),false);assert.equal(pager.snapshot.scope,previous);
 assert.equal(requireSelectedWebsite(pager.snapshot.scope!,'site-25').id,'site-25');
 fail=false;assert.equal(await pager.refresh(),true);assert.equal(pager.snapshot.scope!.websites.length,25);
 assert.equal(pager.snapshot.nextCursor,'next');
});
test('untrusted domain and scope fields are refused before registry selection',()=>{
 for(const bad of [{...site(1),domain:'<script>'},{...site(1),domain:'Other.Example'},
   {...site(1),monthlyBudgetMinor:'unknown'},{...site(1),id:''}]){
   assert.throws(()=>appendScopedWebsitePage(null,{...page('org-a',0,1,null),websites:[bad]}),/PAGE_UNAVAILABLE/);
 }
});
