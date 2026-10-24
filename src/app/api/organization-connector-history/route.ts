import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { pageError } from '../../../server/organization-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Row = RowDataPacket & { issuer: string; key_id: string; event_id: string; channel: string;
  destination_id: string; sequence: string; observed_at: string | null; recorded_status: string | null };
const headers = { 'Cache-Control': 'no-store' };

/** Candidate-011 metadata only. Rows are historical claims, never independently verified health. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    if (!['owner','admin'].includes(organization.role)) return Response.json({ ok:false, code:'INSUFFICIENT_ROLE' },{status:403,headers});
    const websiteId = z.string().uuid().safeParse(new URL(request.url).searchParams.get('websiteId'));
    if (!websiteId.success) return Response.json({ ok:false, code:'INVALID_WEBSITE' },{status:400,headers});
    const pool = getMySQLPool();
    const [sites] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM growth_websites WHERE organization_id=? AND id=? LIMIT 1',[organization.id,websiteId.data]);
    if (sites.length!==1) return Response.json({ ok:false, code:'WEBSITE_NOT_FOUND' },{status:404,headers});
    const [rows] = await pool.execute<Row[]>(
      `SELECT issuer,key_id,event_id,channel,destination_id,sequence,
        JSON_UNQUOTE(JSON_EXTRACT(probe_json,'$.attestation.evidence.checkedAt')) AS observed_at,
        JSON_UNQUOTE(JSON_EXTRACT(probe_json,'$.attestation.evidence.status')) AS recorded_status
       FROM growth_connector_evidence_history WHERE organization_id=? AND website_id=?
       ORDER BY issuer,key_id,sequence DESC LIMIT 25`,[organization.id,websiteId.data]);
    return Response.json({ ok:true, websiteId:websiteId.data, trustworthyHealth:false,
      items:rows.map(row=>({ issuer:row.issuer,keyId:row.key_id,eventId:row.event_id,channel:row.channel,
        destinationId:row.destination_id,sequence:String(row.sequence),claimedObservedAt:row.observed_at,
        recordedStatus:row.recorded_status,verification:'unverified_record' })) },{headers});
  } catch(error) { return pageError(error); }
}
