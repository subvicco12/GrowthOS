import { assertIsolatedWorkflowRuntime } from './isolated-workflow-runtime';
import { operationAction, operationsQuery } from '../core/isolated-operations';
import { rejectUntrustedOrigin, readBoundedJson } from './request-security';
import type { MySQLIsolatedOperations } from './mysql-isolated-operations';
export function assertSession03Runtime(env:Record<string,string|undefined>=process.env){assertIsolatedWorkflowRuntime(env);if(env.GROWTHOS_SESSION03_DISPOSABLE!=='YES')throw Error('ISOLATED_SCHEMA_REQUIRED');}
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const errors:Record<string,number>={ISOLATED_SCHEMA_REQUIRED:501,AUTHENTICATION_REQUIRED:401,ORGANIZATION_REQUIRED:403,ORGANIZATION_FORBIDDEN:403,INSUFFICIENT_ROLE:403,
 ORGANIZATION_SCOPE_CHANGED:403,INVALID_CURSOR:400,CONNECTOR_CONFIGURATION_INVALID:400,JOB_NOT_FOUND:404,WEBSITE_NOT_FOUND:404,APPROVAL_NOT_FOUND:404,
 OWNERSHIP_AUTHORITY_REQUIRED:409,CONNECTOR_PREREQUISITE_REQUIRED:409,CONNECTOR_ENROLLMENT_REQUIRED:409,APPROVAL_REVOKED:409,APPROVAL_REQUIRED:409,
 WEBSITE_STOPPED:409,LEASE_LOST:409,LEASE_BUSY:409,JOB_STATE_CONFLICT:409,JOB_NOT_DUE:409,WORKFLOW_BUSY:409,CONNECTOR_KEY_UNAVAILABLE:503,WORKFLOW_OUTCOME_UNKNOWN:503};
export function createOperationsHandlers(context:(request:Request)=>Promise<{userId:string;organization:{id:string;role:string}}>,store:()=>MySQLIsolatedOperations,gate:()=>void=assertSession03Runtime){
 const failure=(error:unknown)=>{const code=error instanceof Error?error.message:'';return reply({ok:false,code:errors[code]?code:'SERVICE_UNAVAILABLE'},errors[code]||503);};
 return {
  async GET(request:Request){try{gate();const auth=await context(request),url=new URL(request.url);if([...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))return reply({ok:false,code:'INVALID_SCOPE'},400);
   const query=operationsQuery.safeParse(Object.fromEntries(url.searchParams));if(!query.success)return reply({ok:false,code:'INVALID_SCOPE'},400);
   if(query.data.organizationId!==auth.organization.id)throw Error('ORGANIZATION_SCOPE_CHANGED');
   return reply({ok:true,organizationId:auth.organization.id,websiteId:query.data.websiteId,stream:query.data.stream,...await store().operations({...query.data,actorId:auth.userId},query.data.stream,query.data.cursor)});
  }catch(error){return failure(error);}},
  async POST(request:Request){const origin=rejectUntrustedOrigin(request);if(origin)return origin;
   try{gate();const auth=await context(request);if(!['owner','admin'].includes(auth.organization.role))throw Error('INSUFFICIENT_ROLE');
    const body=await readBoundedJson(request);if(body.error)return body.error;const parsed=operationAction.safeParse(body.value);if(!parsed.success)return reply({ok:false,code:'INVALID_OPERATION'},400);
    const input=parsed.data;if(input.organizationId!==auth.organization.id)throw Error('ORGANIZATION_SCOPE_CHANGED');
    const s={organizationId:auth.organization.id,websiteId:input.websiteId,actorId:auth.userId},adapter=store();let result:unknown;
    switch(input.action){case 'tick':result=await adapter.tick(s);break;case 'recover':result=await adapter.recover(s);break;case 'enroll':result=await adapter.enroll(s,input.endpoint);break;
     case 'health':result=await adapter.checkHealth(s);break;case 'revoke_ownership':result=await adapter.revokeOwnership(s);break;case 'expire_ownership':result=await adapter.revokeOwnership(s,true);break;
     case 'revoke_connector':result=await adapter.revokeConnector(s);break;case 'cancel':result=await adapter.cancelJob(s,input.jobId);break;
     case 'revoke_approval':result=await adapter.revokeApproval(s,input.approvalId,input.reason);break;}
    return reply({ok:true,organizationId:s.organizationId,websiteId:s.websiteId,result,externalAction:false});
   }catch(error){return failure(error);}
  }
 };
}
