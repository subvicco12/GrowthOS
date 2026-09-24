import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionWordPressConfig } from '../production-config';

test('production config requires the canonical GrowthOS WordPress host',()=>{
 assert.deepEqual(validateProductionWordPressConfig({}),{ok:false,code:'NEEDS_CONNECTION'});
 assert.deepEqual(validateProductionWordPressConfig({GROWTHOS_WORDPRESS_URL:'https://example.com',GROWTHOS_WORDPRESS_USERNAME:'admin',GROWTHOS_WORDPRESS_APPLICATION_PASSWORD:'secret'}),{ok:false,code:'WRONG_WORDPRESS_HOST'});
 assert.deepEqual(validateProductionWordPressConfig({GROWTHOS_WORDPRESS_URL:'http://growthos.converentis.com',GROWTHOS_WORDPRESS_USERNAME:'admin',GROWTHOS_WORDPRESS_APPLICATION_PASSWORD:'secret'}),{ok:false,code:'INVALID_CONFIGURATION'});
 assert.deepEqual(validateProductionWordPressConfig({GROWTHOS_WORDPRESS_URL:'https://growthos.converentis.com',GROWTHOS_WORDPRESS_USERNAME:'admin',GROWTHOS_WORDPRESS_APPLICATION_PASSWORD:'secret'}),{ok:true,code:'READY'});
});
