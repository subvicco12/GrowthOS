import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDashboardSite } from '../dashboard-api';
import { readWordPressGrowthOSConfig } from '../wordpress-growthos-client';
import { growthSites } from '../portfolio';
import { siteScopeOptions, resolveSiteScope } from '../site-scope';

test('dashboard accepts production integer site IDs',()=>{
 assert.equal(validateDashboardSite(undefined),undefined);
 assert.equal(validateDashboardSite('1'),1);
 assert.equal(validateDashboardSite('6'),6);
 assert.throws(()=>validateDashboardSite('priceinsight360.com'),/INVALID_SITE/);
 assert.throws(()=>validateDashboardSite('00000000-0000-0000-0000-000000000001'),/INVALID_SITE/);
});

test('production site scope maps six domains to GrowthOS IDs',()=>{
 const options=siteScopeOptions(growthSites);
 assert.deepEqual([...options.map(x=>x.value).filter(Boolean)].sort(),['1','2','3','4','5','6']);
 assert.equal(resolveSiteScope(growthSites,'1')?.domain,'priceinsight360.com');
 assert.equal(resolveSiteScope(growthSites,'6')?.domain,'calcumint.com');
});

test('WordPress GrowthOS config is server-only and HTTPS',()=>{
 assert.equal(readWordPressGrowthOSConfig({}),null);
 const config=readWordPressGrowthOSConfig({GROWTHOS_WORDPRESS_URL:'https://growthos.converentis.com',GROWTHOS_WORDPRESS_USERNAME:'admin',GROWTHOS_WORDPRESS_APPLICATION_PASSWORD:'secret'});
 assert.equal(config?.baseUrl,'https://growthos.converentis.com');
 assert.throws(()=>readWordPressGrowthOSConfig({GROWTHOS_WORDPRESS_URL:'http://growthos.converentis.com',GROWTHOS_WORDPRESS_USERNAME:'admin',GROWTHOS_WORDPRESS_APPLICATION_PASSWORD:'secret'}),/WORDPRESS_HTTPS_REQUIRED/);
});

test('WordPress production client posts approval decisions to GrowthOS REST',async()=>{
 const {WordPressGrowthOSClient}=await import('../wordpress-growthos-client');
 const original=globalThis.fetch; let seen:any;
 globalThis.fetch=(async(url:any,init:any)=>{seen={url:String(url),init};return new Response(JSON.stringify({ok:true,recommendation:{id:7,status:'approved'}}),{status:200,headers:{'Content-Type':'application/json'}});}) as any;
 try{const client=new WordPressGrowthOSClient({baseUrl:'https://growthos.example',username:'admin',applicationPassword:'secret'});const out:any=await client.decideRecommendation(7,'approved','idem-7','reviewed');assert.equal(out.ok,true);assert.equal(seen.url,'https://growthos.example/wp-json/growthos/v1/recommendations/7/decision');assert.equal(seen.init.method,'POST');assert.deepEqual(JSON.parse(seen.init.body),{decision:'approved',idempotency_key:'idem-7',note:'reviewed'});assert.ok(String(seen.init.headers.Authorization).startsWith('Basic '));}finally{globalThis.fetch=original;}
});
