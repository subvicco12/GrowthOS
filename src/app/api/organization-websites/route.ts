import { websiteDomainSchema } from '../../../core/website-domain-schema';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertWebsiteAdminAccess } from '../../../core/admin-website-access';
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

const registerSchema = z.object({
  domain: websiteDomainSchema,
  platform: z.enum(['wordpress','nextjs','react','static','custom'])
}).strict();

/** Registration is draft-only; it never verifies ownership or enables automation. */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  try {
    if (!origin || !host || new URL(origin).protocol !== 'https:' || new URL(origin).host !== host)
      return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 });
  } catch { return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 }); }
  try {
    const { userId, organization } = await getAuthenticatedOrganizationContext(request);
    assertWebsiteAdminAccess({ userId, organizationId: organization.id, role: organization.role, active: true }, organization.id, 'register');
    const parsed = registerSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ ok: false, code: 'INVALID_WEBSITE' }, { status: 400 });
    const id = randomUUID();
    await getMySQLPool().execute(
      'INSERT INTO growth_websites (id,organization_id,domain,platform,status,monthly_budget_minor,automation_enabled,auto_publish_enabled) VALUES (?,?,?,? ,\'draft\',0,FALSE,FALSE)',
      [id,organization.id,parsed.data.domain,parsed.data.platform]
    );
    return Response.json({ ok: true, website: { id, domain: parsed.data.domain, status: 'draft' } },
      { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const e = error as { message?: string; code?: string };
    const status = e.message === 'AUTHENTICATION_REQUIRED' ? 401 :
      ['ORGANIZATION_REQUIRED','ORGANIZATION_FORBIDDEN','INSUFFICIENT_ROLE','UNAUTHORIZED_ORGANIZATION'].includes(e.message || '') ? 403 :
      e.code === 'ER_DUP_ENTRY' ? 409 : 503;
    return Response.json({ ok: false, code: status === 409 ? 'WEBSITE_EXISTS' : status === 503 ? 'SERVICE_UNAVAILABLE' : status === 401 ? 'AUTHENTICATION_REQUIRED' : 'FORBIDDEN' },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
