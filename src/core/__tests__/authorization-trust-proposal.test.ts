import test from 'node:test';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const require=createRequire(import.meta.url),{verify}=require('../../../scripts/verify-authorization-trust-proposal.cjs');
const sql=readFileSync('database/proposals/011_authorization_trust_candidate.sql','utf8'),manifest=JSON.parse(readFileSync('database/proposals/011_authorization_trust_manifest.json','utf8'));
test('011 review inventory is pinned and explicitly uninstalled',()=>{const result=verify();assert.equal(result.installationAuthorized,false);assert.equal(result.runtimeCertified,false);assert.equal(result.additions.tables,8);assert.equal(result.additions.triggers,17);});
test('modified DDL, executable comments, database switching and hash/inventory drift refuse offline',()=>{
 for(const changed of [sql+'USE growthos_test_other;\n',sql.replace('CREATE TABLE','/*! CREATE TABLE */'),sql.replace('growth_content_authorizations','wrong_table'),sql.replace('FOREIGN KEY','FOREIGN KEZ')])assert.throws(()=>verify(changed,manifest));
 assert.throws(()=>verify(sql,{...manifest,inventory:{...manifest.inventory,fkColumns:0}}));
});

test('all FK child indexes must be explicitly declared even if a modified manifest is supplied',()=>{
 const altered=sql.replace(' KEY fk_auth_reservation_idx (organization_id,website_id,reservation_id),\n','');
 const {inventory}=require('../../../scripts/verify-authorization-trust-proposal.cjs');
 assert.throws(()=>verify(altered,{...manifest,sha256:createHash('sha256').update(altered).digest('hex'),inventory:inventory(altered)}),/FK_INDEX_UNDECLARED|GRAMMAR/);
});
