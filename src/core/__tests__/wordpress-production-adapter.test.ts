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
