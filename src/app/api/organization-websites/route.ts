import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WebsiteRow = RowDataPacket & {
  id: string; domain: string; platform: string; status: string;
  automation_enabled: number; auto_publish_enabled: number; monthly_budget_minor: string;
};

/** Read-only tenant-scoped website registry. No mutations, publishing or AI spending. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const [rows] = await getMySQLPool().execute<WebsiteRow[]>(
      'SELECT id,domain,platform,status,automation_enabled,auto_publish_enabled,monthly_budget_minor FROM growth_websites WHERE organization_id=? ORDER BY domain,id',
      [organization.id]
    );
    return Response.json({
      ok: true, organization: { id: organization.id, name: organization.name, role: organization.role },
      websites: rows.map(row => ({
        id: row.id, domain: row.domain, platform: row.platform, status: row.status,
        automationEnabled: Boolean(row.automation_enabled),
        autoPublishEnabled: Boolean(row.auto_publish_enabled),
        monthlyBudgetMinor: String(row.monthly_budget_minor)
      }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTHENTICATION_REQUIRED' ? 401 :
      code === 'ORGANIZATION_REQUIRED' || code === 'ORGANIZATION_FORBIDDEN' ? 403 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
