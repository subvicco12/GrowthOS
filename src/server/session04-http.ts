import {z} from 'zod';
import {assertSession03Runtime} from './isolated-operations-http';
import {readBoundedJson,rejectUntrustedOrigin} from './request-security';
import {WordPressFixtureService,localWordPressFixtureTransport} from './wordpress-readonly-fixture';
import {getMySQLPool} from './mysql';
import type {Session04Portfolio} from './session04-portfolio';
export function assertSession04Runtime(env:Record<string,string|undefined>=process.env){assertSession03Runtime(env);if(env.GROWTHOS_SESSION04_DISPOSABLE!=='YES')throw Error('ISOLATED_SCHEMA_REQUIRED');}
const id=z.string().uuid();
const query=z.object({organizationId:id,view:z.enum(['sites','incidents','export']).default('sites'),search:z.string().max(100).default(''),status:z.enum(['all','draft','active','paused','archived','verifying','connected','auditing']).default('all'),cursor:z.string().max(900).optional(),websiteId:id.optional()}).strict();
const action=z.discriminatedUnion('action',[
 z.object({organizationId:id,websiteId:id,action:z.enum(['wp_enroll','wp_health','wp_revoke'])}).strict(),
 z.object({organizationId:id,action:z.literal('fleet'),stopped:z.boolean(),aiLimitMinor:z.literal('0'),externalEnabled:z.literal(false)}).strict(),
 z.object({organizationId:id,websiteId:id,action:z.literal('stage'),requestKey:id,bundle:z.unknown()}).strict(),
 z.object({organizationId:id,websiteId:id,action:z.literal('revert'),batchId:id}).strict(),
 z.object({organizationId:id,websiteId:id,action:z.literal('observe'),html:z.string().max(131072)}).strict()
]);
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function createSession04Handlers(context:(r:Request)=>Promise<{userId:string;organization:{id:string;role:string}}>,store:()=>Session04Portfolio,gate:()=>void=assertSession04Runtime){
 const fail=(error:unknown)=>{const code=error instanceof Error?error.message:'';const status=code==='ISOLATED_SCHEMA_REQUIRED'?501:code==='AUTHENTICATION_REQUIRED'?401:['INSUFFICIENT_ROLE','ORGANIZATION_FORBIDDEN','ORGANIZATION_REQUIRED','ORGANIZATION_SCOPE_CHANGED'].includes(code)?403:['BUNDLE_INVALID','BUNDLE_LIMIT','INVALID_CURSOR','BUNDLE_HASH_MISMATCH','BUNDLE_SCOPE_MISMATCH','BUNDLE_APPROVAL_MISSING','BUNDLE_DUPLICATE'].includes(code)?400:['WEBSITE_NOT_FOUND','BUNDLE_NOT_FOUND'].includes(code)?404:['BUNDLE_CONFLICT','WORKFLOW_BUSY'].includes(code)?409:503;return json({ok:false,code:status===503?'COMPATIBILITY_OR_SERVICE_UNAVAILABLE':code},status);};
 return {async GET(r:Request){try{gate();const auth=await context(r),url=new URL(r.url);if([...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))return json({ok:false,code:'INVALID_QUERY'},400);const parsed=query.safeParse(Object.fromEntries(url.searchParams));if(!parsed.success)return json({ok:false,code:'INVALID_QUERY'},400);const p=parsed.data;if(p.organizationId!==auth.organization.id)throw Error('ORGANIZATION_SCOPE_CHANGED');
  if(p.view==='export'){if(!p.websiteId)return json({ok:false,code:'WEBSITE_REQUIRED'},400);return json({ok:true,organizationId:auth.organization.id,bundle:await store().exportBundle(auth.organization.id,p.websiteId,auth.userId)});}
  return json({ok:true,organizationId:auth.organization.id,view:p.view,...await store().portfolio(auth.organization.id,auth.userId,p.view,p.search,p.status,p.cursor)});
 }catch(e){return fail(e);}},async POST(r:Request){const origin=rejectUntrustedOrigin(r);if(origin)return origin;try{gate();const auth=await context(r),body=await readBoundedJson(r,2097152);if(body.error)return body.error;const parsed=action.safeParse(body.value);if(!parsed.success)return json({ok:false,code:'INVALID_ACTION'},400);const p=parsed.data;if(p.organizationId!==auth.organization.id)throw Error('ORGANIZATION_SCOPE_CHANGED');if(!['owner','admin'].includes(auth.organization.role)&&!(p.action==='observe'&&auth.organization.role==='editor'))throw Error('INSUFFICIENT_ROLE');let result:unknown;
  switch(p.action){case 'wp_enroll':case 'wp_health':case 'wp_revoke':{const wp=new WordPressFixtureService(getMySQLPool(),localWordPressFixtureTransport());const scope={organizationId:p.organizationId,websiteId:p.websiteId,actorId:auth.userId};result=p.action==='wp_enroll'?await wp.enrollWordPress(scope):p.action==='wp_health'?await wp.healthWordPress(scope):await wp.revokeWordPress(scope);break;}case 'fleet':result=await store().fleet(p.organizationId,auth.userId,p.stopped);break;case 'stage':result=await store().stageBundle(p.organizationId,p.websiteId,auth.userId,p.requestKey,p.bundle);break;case 'revert':result=await store().revertBundle(p.organizationId,p.websiteId,auth.userId,p.batchId);break;case 'observe':result=await store().observe(p.organizationId,p.websiteId,auth.userId,p.html);break;}
  return json({ok:true,organizationId:p.organizationId,result,externalAction:false});
 }catch(e){return fail(e);}}};
}
