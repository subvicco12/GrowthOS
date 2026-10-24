import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {verify}=require('../../../scripts/verify-product-authority-candidate-offline.cjs');
const sql=readFileSync('database/proposals/product-authority-v1/015_product_authority_candidate.sql','utf8');

test('candidate 015 is pinned review-only and cannot silently enter a migration runner',()=>{
 const result=verify();assert.equal(result.dbExecution,false);assert.equal(result.status,'REVIEW_ONLY_UNINSTALLED');
 assert.deepEqual([result.tables,result.triggers,result.foreignKeyColumns],[7,12,19]);
});
test('modified candidate SQL, executable comment and database switching refuse before database access',()=>{
 for(const changed of [sql+'USE production;\n',sql.replace('CREATE TABLE','/*! CREATE TABLE */'),
   sql.replace('growth_plan_usage_events','growth_plan_usage_eventz')])
   assert.throws(()=>verify(changed),/CANDIDATE_015_HASH_MISMATCH/);
});
