import { getAuthenticatedOrganizationContext } from '../../../../server/organization-context';
import { getMySQLPool } from '../../../../server/mysql';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ApprovalRow = RowDataPacket & {
  id: string; website_id: string; title: string; action_type: string; status: string; created_at: Date;
};

/** A safe, read-only review inbox; no decision or publishing endpoint is exposed. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const [rows] = await getMySQLPool().execute<ApprovalRow[]>(
      'SELECT id,website_id,title,action_type,status,created_at FROM growth_approval_queue WHERE organization_id=? AND status='pending' ORDER BY created_at,id LIMIT 100',
      [organization.id]
    );
    return Response.json({ ok: true, items: rows, role: organization.role, decisionsEnabled: false },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTHENTICATION_REQUIRED' ? 401 :
      code === 'ORGANIZATION_REQUIRED' || code === 'ORGANIZATION_FORBIDDEN' ? 403 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
