import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardSnapshot } from '../dashboard-repository';

test('dashboard snapshot carries live WordPress site registry rows',()=>{
 const snapshot=buildDashboardSnapshot({recommendations:[],approvals:[],integrations:[],activeJobs:0,counts:{needsApproval:0,inDevelopment:0,inProduction:0,qaFailed:0,readyForReview:0,readyForListing:0,readyToPublish:0,live:0,exceptions:0,activeJobs:0},sites:[{id:'1',name:'PriceInsight360',domain:'priceinsight360.com',status:'active'}]},new Date('2026-09-24T00:00:00Z'));
 assert.deepEqual(snapshot.sites,[{id:'1',name:'PriceInsight360',domain:'priceinsight360.com',status:'active'}]);
});
