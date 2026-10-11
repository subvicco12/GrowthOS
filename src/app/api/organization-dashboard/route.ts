import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CountRow = RowDataPacket & { total: number };
type WebsiteRow = RowDataPacket & { id: string; domain: string; status: string; platform: string };

/** Dashboard only reads rows for the selected, authenticated organization. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const pool = getMySQLPool();
    const [websites] = await pool.execute<WebsiteRow[]>(
      'SELECT id,domain,status,platform FROM growth_websites WHERE organization_id=? ORDER BY domain LIMIT 100',
      [organization.id]
    );
    const [pending] = await pool.execute<CountRow[]>(
      'SELECT COUNT(*) AS total FROM growth_approval_queue WHERE organization_id=? AND status=?',
      [organization.id, 'pending']
    );
    return Response.json({
      ok: true,
      organization: { id: organization.id, name: organization.name, role: organization.role },
      websites,
      websiteCount: websites.length,
      pendingApprovals: Number(pending[0]?.total ?? 0),
      automationEnabled: false,
      publishingEnabled: false,
      dataLimitedToFirst100Websites: websites.length === 100
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTHENTICATION_REQUIRED' ? 401 :
      code === 'ORGANIZATION_REQUIRED' || code === 'ORGANIZATION_FORBIDDEN' ? 403 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
