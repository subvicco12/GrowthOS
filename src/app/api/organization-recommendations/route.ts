import { z } from 'zod';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { rejectUntrustedOrigin, readBoundedJson } from '../../../server/request-security';
import { pageError } from '../../../server/organization-pagination';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
const website=z.string().uuid();
const decision=z.object({organizationId:z.string().uuid(),websiteId:website,recommendationId:z.string().uuid(),
  expectedRevision:z.number().int().nonnegative(),evidenceHash:z.string().regex(/^[0-9a-f]{64}$/),
  decision:z.enum(['accept_for_planning','reject','defer']),reason:z.string().trim().min(5).max(500),
  idempotencyKey:z.string().regex(/^[a-z0-9_-]{8,100}$/i)}).strict();
const unavailable=()=>Response.json({ok:false,code:'REVIEW_PERSISTENCE_UNAVAILABLE',available:false},
  {status:503,headers:noStore});

/** The candidate 016 read projection remains disabled until disposable schema and grants are certified. */
export async function GET(request:Request):Promise<Response>{
  try {
    const {organization}=await getAuthenticatedOrganizationContext(request);
    const params=new URL(request.url).searchParams;
    if(params.get('organizationId')!==organization.id)return Response.json({ok:false,code:'ORGANIZATION_SCOPE_CHANGED'},
      {status:403,headers:noStore});
    if(!website.safeParse(params.get('websiteId')).success)return Response.json({ok:false,code:'INVALID_WEBSITE'},
      {status:400,headers:noStore});
    return unavailable();
  } catch(error){return pageError(error);}
}

/** Review decisions cannot silently fall back to an in-memory store or an unverified migration. */
export async function POST(request:Request):Promise<Response>{
  const originError=rejectUntrustedOrigin(request);if(originError)return originError;
  try {
    const {organization}=await getAuthenticatedOrganizationContext(request);
    if(!['owner','admin'].includes(organization.role))return Response.json({ok:false,code:'INSUFFICIENT_ROLE'},
      {status:403,headers:noStore});
    const body=await readBoundedJson(request);if(body.error)return body.error;
    const parsed=decision.safeParse(body.value);
    if(!parsed.success)return Response.json({ok:false,code:'INVALID_REVIEW_DECISION'},
      {status:400,headers:noStore});
    if(parsed.data.organizationId!==organization.id)return Response.json({ok:false,code:'ORGANIZATION_SCOPE_CHANGED'},
      {status:403,headers:noStore});
    return unavailable();
  } catch(error){return pageError(error);}
}
