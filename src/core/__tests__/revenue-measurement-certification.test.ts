import test from 'node:test';import assert from 'node:assert/strict';import { certifyRevenueMeasurement } from '../revenue-measurement-certification';
const now='2026-09-25T00:00:00.000Z';const event={siteId:'site-1',source:'paddle',visitors:100,conversions:5,revenueUsd:250,observedAt:now,attributionRef:'transaction:tx_1'};
test('certifies attributed revenue measurement',()=>{const r=certifyRevenueMeasurement('site-1',[event],now);assert.equal(r.summary.conversionRate,.05);assert.equal(r.summary.revenuePerVisitor,2.5)});
test('rejects cross-site revenue evidence',()=>{assert.throws(()=>certifyRevenueMeasurement('site-2',[event],now),/REVENUE_CROSS_SITE_EVIDENCE/)});
test('rejects unattributed revenue evidence',()=>{assert.throws(()=>certifyRevenueMeasurement('site-1',[{...event,attributionRef:''}],now),/REVENUE_ATTRIBUTION_EVIDENCE_INVALID/)});
test('rejects empty measurement window',()=>{assert.throws(()=>certifyRevenueMeasurement('site-1',[],now),/REVENUE_EVIDENCE_REQUIRED/)});
