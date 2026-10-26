import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendScopedWebsitePage,includeScopedRegistryWebsite} from '../scoped-website-pages';
import {requireSelectedWebsite,type WebsiteSummary} from '../workspace-journey';
const site=(i:number):WebsiteSummary=>({id:`site-${i}`,domain:`site-${i}.example`,status:'draft',platform:'wordpress',verifiedAt:null,automationEnabled:false,autoPublishEnabled:false,monthlyBudgetMinor:'0'});
test('cursor pages extend a tenant-scoped portfolio beyond the old navigation ceiling',()=>{
 let scope=appendScopedWebsitePage(null,{organization:{id:'org-a'},websites:Array.from({length:100},(_,i)=>site(i)),nextCursor:'second'});
 scope=appendScopedWebsitePage(scope,{organization:{id:'org-a'},websites:Array.from({length:100},(_,i)=>site(i+100)),nextCursor:'third'},new Set(),'second');
 scope=appendScopedWebsitePage(scope,{organization:{id:'org-a'},websites:Array.from({length:100},(_,i)=>site(i+200)),nextCursor:null},new Set(['second']),'third');
 assert.equal(scope.websites.length,300);assert.equal(requireSelectedWebsite(scope,'site-299').domain,'site-299.example');
});
test('paging and registry handoff refuse cross-tenant, duplicate and looping selection',()=>{
 const initial=appendScopedWebsitePage(null,{organization:{id:'org-a'},websites:[site(1)],nextCursor:'next'});
 assert.throws(()=>appendScopedWebsitePage(initial,{organization:{id:'org-b'},websites:[site(2)],nextCursor:null}),/PAGE_UNAVAILABLE/);
 assert.throws(()=>appendScopedWebsitePage(initial,{organization:{id:'org-a'},websites:[site(1)],nextCursor:null}),/PAGE_UNAVAILABLE/);
 assert.throws(()=>appendScopedWebsitePage(initial,{organization:{id:'org-a'},websites:[site(2)],nextCursor:'next'},new Set(),'next'),/PAGE_UNAVAILABLE/);
 assert.throws(()=>appendScopedWebsitePage(initial,{organization:{id:'org-a'},websites:[site(2)],nextCursor:'old'},new Set(['old']),'next'),/PAGE_UNAVAILABLE/);
 assert.throws(()=>includeScopedRegistryWebsite(initial,'org-b',site(2)),/SCOPE_UNAVAILABLE/);
 assert.throws(()=>includeScopedRegistryWebsite(initial,'org-a',{...site(1),domain:'forged.example'}),/SCOPE_UNAVAILABLE/);
 const extended=includeScopedRegistryWebsite(initial,'org-a',site(2));assert.equal(requireSelectedWebsite(extended,'site-2').domain,'site-2.example');
 assert.equal(includeScopedRegistryWebsite(extended,'org-a',site(2)),extended);
});
