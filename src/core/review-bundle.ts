import {z} from 'zod';
import {createAnalysisInput} from './isolated-workflows';
const id=z.string().uuid();
const research=z.object({kind:z.literal('manual_research'),id,createdAt:z.string().datetime(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),input:createAnalysisInput,trust:z.literal('unverified_manual')}).strict();
const approval=z.object({kind:z.literal('internal_approval'),id,createdAt:z.string().datetime(),title:z.string().max(240),actionType:z.enum(['manual_analysis','manual_recommendation']),status:z.enum(['pending','approved','rejected','deferred']),trust:z.literal('internal_only')}).strict();
const decision=z.object({kind:z.literal('approval_decision'),id,createdAt:z.string().datetime(),approvalId:id,actorId:id,idempotencyKey:z.string().max(128),decision:z.enum(['approved','rejected','deferred']),note:z.string().max(2000).nullable(),trust:z.literal('internal_only')}).strict();
const revoked=z.object({kind:z.literal('approval_revocation'),id,createdAt:z.string().datetime(),approvalId:id,actorId:id,reason:z.string().max(200),trust:z.literal('internal_only')}).strict();
export const reviewBundleSchema=z.object({version:z.literal('GrowthOSReviewBundle/v1'),organizationId:id,websiteId:id,
 source:z.literal('isolated-017-018'),target:z.literal('canonical_review_quarantine'),records:z.array(z.discriminatedUnion('kind',[research,approval,decision,revoked])).max(1000)}).strict();
export type ReviewBundle=z.infer<typeof reviewBundleSchema>;
export function validateReviewBundle(raw:unknown,org:string,site:string):ReviewBundle{
 if(new TextEncoder().encode(JSON.stringify(raw)).length>1800000)throw Error('BUNDLE_LIMIT');
 const parsed=reviewBundleSchema.safeParse(raw);if(!parsed.success)throw Error('BUNDLE_INVALID');const bundle=parsed.data;if(bundle.organizationId!==org||bundle.websiteId!==site)throw Error('BUNDLE_SCOPE_MISMATCH');
 const keys=new Set<string>(),approvals=new Set(bundle.records.filter(r=>r.kind==='internal_approval').map(r=>r.id));
 for(const record of bundle.records){const key=record.kind+':'+record.id;if(keys.has(key))throw Error('BUNDLE_DUPLICATE');keys.add(key);
  if(record.kind==='manual_research'&&(record.input.organizationId!==org||record.input.websiteId!==site))throw Error('BUNDLE_SCOPE_MISMATCH');
  if((record.kind==='approval_decision'||record.kind==='approval_revocation')&&!approvals.has(record.approvalId))throw Error('BUNDLE_APPROVAL_MISSING');
 }return bundle;
}
