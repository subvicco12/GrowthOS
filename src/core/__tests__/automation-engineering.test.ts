import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceWorkItem } from '../engineering-workflow';
import { assertAutomationAllowed } from '../automation-policy';

test('engineering workflow only advances one controlled stage at a time',()=>{
 const item={id:'1',siteId:'s',title:'Fix SEO',stage:'recommendation' as const,createdAt:'x',updatedAt:'x'};
 assert.equal(advanceWorkItem(item,'approval').stage,'approval');
 assert.throws(()=>advanceWorkItem(item,'merge'),/INVALID_ENGINEERING_STAGE_TRANSITION/);
});

test('amber and red actions require approval',()=>{
 assert.doesNotThrow(()=>assertAutomationAllowed('green',false));
 assert.throws(()=>assertAutomationAllowed('amber',false),/APPROVAL_REQUIRED/);
 assert.throws(()=>assertAutomationAllowed('red',false),/APPROVAL_REQUIRED/);
});
