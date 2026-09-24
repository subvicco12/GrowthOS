import test from 'node:test';
import assert from 'node:assert/strict';
import { certifyGrowthWorkflow } from '../growth-workflow-certification';
const now='2026-09-25T00:00:00.000Z';
const signal={id:'g1',siteId:'site-1',category:'cro' as const,title:'Improve signup',description:'Observed funnel drop',evidence:[{source:'analytics',observedAt:now,url:'https://example.test/report'}],impact:4,confidence:4,effort:2,recurringCostUsd:0,risk:2,successMetric:'signup conversion rate',approvalClass:'amber' as const};
test('certifies evidence-backed growth actions',()=>{const result=certifyGrowthWorkflow('site-1',[signal],now);assert.equal(result.actions[0].signalId,'g1');assert.equal(result.actions[0].evidenceCount,1)});
test('rejects cross-site growth evidence',()=>{assert.throws(()=>certifyGrowthWorkflow('site-2',[signal],now),/GROWTH_CROSS_SITE_EVIDENCE/)});
test('rejects unsupported growth signals',()=>{assert.throws(()=>certifyGrowthWorkflow('site-1',[{...signal,evidence:[]}],now),/GROWTH_EVIDENCE_REQUIRED/)});
test('rejects evidence without observed time',()=>{assert.throws(()=>certifyGrowthWorkflow('site-1',[{...signal,evidence:[{source:'analytics',observedAt:'invalid'}]}],now),/GROWTH_EVIDENCE_INVALID/)});
