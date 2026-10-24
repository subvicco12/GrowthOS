import { z } from 'zod';
import type { RowDataPacket } from 'mysql2/promise';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { currentConnectorHealthRuntime } from '../../../server/connector-health-runtime';
import { pageError } from '../../../server/organization-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const query = z.object({ websiteId:z.string().uuid(), channel:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  destinationId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict();
const headers = { 'Cache-Control':'no-store' };
type Destination = RowDataPacket & { revision:string; target:string; enabled:number };

/** Independently verified only when a real external trust runtime is installed. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const parameters = new URL(request.url).searchParams;
    if ([...parameters.keys()].length!==3 || ['websiteId','channel','destinationId'].some(key=>parameters.getAll(key).length!==1))
      return Response.json({ok:false,code:'INVALID_CONNECTOR_SCOPE'},{status:400,headers});
    const parsed = query.safeParse(Object.fromEntries(parameters));
    if (!parsed.success) return Response.json({ok:false,code:'INVALID_CONNECTOR_SCOPE'},{status:400,headers});
    const {websiteId,channel,destinationId}=parsed.data;
    const [sites]=await getMySQLPool().execute<RowDataPacket[]>(
      'SELECT id FROM growth_websites WHERE organization_id=? AND id=? LIMIT 1',[organization.id,websiteId]);
    if(sites.length!==1)return Response.json({ok:false,code:'WEBSITE_NOT_FOUND'},{status:404,headers});
    const trust=currentConnectorHealthRuntime();
    if(!trust)return Response.json({ok:true,websiteId,channel,destinationId,
      state:'unknown',checkedAt:null,lastSuccessfulAt:null,reason:'INDEPENDENT_TRUST_UNAVAILABLE'},{headers});
    if(trust.capability!=='independent-connector-health')throw Error('CONNECTOR_TRUST_UNAVAILABLE');
    const [destinations]=await getMySQLPool().execute<Destination[]>(
      'SELECT revision,target,enabled FROM growth_publication_destinations WHERE organization_id=? AND website_id=? AND id=? AND channel=? LIMIT 1',
      [organization.id,websiteId,destinationId,channel]);
    if(destinations.length!==1)return Response.json({ok:false,code:'DESTINATION_NOT_FOUND'},{status:404,headers});
    if(!Boolean(destinations[0].enabled))return Response.json({ok:true,websiteId,channel,destinationId,
      state:'unknown',checkedAt:null,lastSuccessfulAt:null,reason:'DESTINATION_DISABLED'},{headers});
    const destination={organizationId:organization.id,websiteId,channel,id:destinationId,
      revision:destinations[0].revision,target:destinations[0].target,enabled:Boolean(destinations[0].enabled)};
    try{
      const view=await trust.service.inspectHealth(destination,Date.now());
      return Response.json({ok:true,websiteId,channel,destinationId,...view},{headers});
    }catch{return Response.json({ok:true,websiteId,channel,destinationId,
      state:'unavailable',checkedAt:null,lastSuccessfulAt:null,reason:'TRUST_VERIFICATION_FAILED'},{headers});}
  }catch(error){return pageError(error);}
}
