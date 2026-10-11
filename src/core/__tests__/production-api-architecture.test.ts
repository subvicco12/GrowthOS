import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as dashboard } from '../../app/api/dashboard/route';
import { POST as approvals } from '../../app/api/approvals/route';

test('legacy global API routes fail closed instead of exposing unscoped data',async()=>{
 for(const get of [dashboard,approvals]){
  const response=await get();
  assert.equal(response.status,503);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  const payload=await response.json();
  assert.equal(payload.ok,false);
  assert.equal(payload.code,'LEGACY_ADAPTER_DISABLED');
  assert.equal('sites' in payload,false);
  assert.equal('approvals' in payload,false);
 }
});
