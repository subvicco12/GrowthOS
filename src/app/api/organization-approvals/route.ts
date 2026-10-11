import { getAuthenticatedOrganizationContext } from '../../../../server/organization-context';
import { getMySQLPool } from '../../../../server/mysql';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ApprovalRow = RowDataPacket & {
  id: string; website_id: string; status: string; approval_class: string;
};

/** A safe, read-only review inbox; no decision or publishing endpoint is exposed. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const [rows] = await getMySQLPool().execute<ApprovalRow[]>(
      'SELECT id,website_id,status,approval_class FROM growth_approval_queue WHERE organization_id=? ORDER BY id LIMIT 100',
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
