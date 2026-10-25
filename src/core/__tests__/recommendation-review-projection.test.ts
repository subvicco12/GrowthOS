import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceLabel, filterReviewPage, type RecommendationProjection, type ReviewPage } from '../recommendation-review-projection';

const at='2026-10-25T00:00:00Z';
const item:RecommendationProjection={id:'r1',organizationId:'org-a',websiteId:'site-a',category:'seo',title:'Title',problem:'Problem',
 proposal:'Proposal',expectedBenefit:'Benefit',priority:2,confidence:'manual_unverified',effort:'unknown',costMinor:null,
 currency:null,risk:'review_required',evidenceHash:'a'.repeat(64),observedAt:at,expiresAt:'2026-10-27T00:00:00Z',
 revokedAt:null,state:'proposed',revision:0,sources:[],history:[]};
const page:ReviewPage={organizationId:'org-a',websiteId:'site-a',items:[item],nextCursor:null,reviewAvailable:true};
test('review projection filters scoped records and labels evidence without claiming live status',()=>{
 assert.deepEqual(filterReviewPage(page,{category:'seo',state:'proposed'},at),[item]);
 assert.deepEqual(filterReviewPage(page,{category:'content',state:'all'},at),[]);
 assert.equal(evidenceLabel(item,at),'Unverified manual evidence');
 assert.equal(evidenceLabel({...item,expiresAt:at},at),'Expired evidence');
 assert.equal(evidenceLabel({...item,revokedAt:at},at),'Revoked evidence');
 assert.equal(evidenceLabel({...item,confidence:'independently_verified'},at),'Independently verified evidence');
});
test('review projection rejects mixed tenant, website, duplicate and malformed page records',()=>{
 for(const changed of [{organizationId:'org-b'},{websiteId:'site-b'},{evidenceHash:'bad'},
   {expiresAt:'nonsense'},{revision:-1},{priority:6}])
   assert.throws(()=>filterReviewPage({...page,items:[{...item,...changed}]},{category:'all',state:'all'},at),
     /REVIEW_PROJECTION_SCOPE_OR_DATA_INVALID/);
 assert.throws(()=>filterReviewPage({...page,items:[item,item]},{category:'all',state:'all'},at),/REVIEW_PROJECTION_SCOPE_OR_DATA_INVALID/);
 assert.throws(()=>filterReviewPage({...page,reviewAvailable:false as true},{category:'all',state:'all'},at),/REVIEW_PROJECTION_INVALID/);
 assert.throws(()=>filterReviewPage(page,{category:'all',state:'all'},'invalid'),/REVIEW_CLOCK_UNAVAILABLE/);
});
