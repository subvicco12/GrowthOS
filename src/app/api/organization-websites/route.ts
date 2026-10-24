import { rejectUntrustedOrigin, readBoundedJson } from '../../../server/request-security';
import { websiteDomainSchema } from '../../../core/website-domain-schema';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertWebsiteAdminAccess } from '../../../core/admin-website-access';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import type { RowDataPacket } from 'mysql2/promise';
import { nextPageCursor, PAGE_SIZE, pageError, readPageCursor } from '../../../server/organization-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WebsiteRow = RowDataPacket & {
  id: string; domain: string; platform: string; status: string;
  verified_at: Date | null; automation_enabled: number; auto_publish_enabled: number; monthly_budget_minor: string;
};
const mysqlFlag = (value: unknown): boolean => value === true || value === 1 || value === '1';

/** Read-only tenant-scoped website registry. No mutations, publishing or AI spending. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const cursor = readPageCursor(request, organization.id, 'websites');
    const [rows] = await getMySQLPool().execute<WebsiteRow[]>(
      'SELECT id,domain,platform,status,verified_at,automation_enabled,auto_publish_enabled,monthly_budget_minor FROM growth_websites WHERE organization_id=?' +
        (cursor ? ' AND (domain>? OR (domain=? AND id>?))' : '') + ' ORDER BY domain,id LIMIT ?',
      cursor ? [organization.id, cursor.key, cursor.key, cursor.id, PAGE_SIZE + 1] : [organization.id, PAGE_SIZE + 1]
    );
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return Response.json({
      ok: true, organization: { id: organization.id, name: organization.name, role: organization.role },
      websites: page.map(row => ({
        id: row.id, domain: row.domain, platform: row.platform, status: row.status,
        verifiedAt: row.verified_at,
        automationEnabled: mysqlFlag(row.automation_enabled),
        autoPublishEnabled: mysqlFlag(row.auto_publish_enabled),
        monthlyBudgetMinor: String(row.monthly_budget_minor)
      })),
      nextCursor: rows.length > PAGE_SIZE && last ? nextPageCursor(organization.id, 'websites', last.domain, last.id) : null
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return pageError(error);
  }
}

const registerSchema = z.object({
  organizationId: z.string().uuid(),
  domain: websiteDomainSchema,
  platform: z.enum(['wordpress','nextjs','react','static','custom'])
}).strict();

/** Registration is draft-only; it never verifies ownership or enables automation. */
export async function POST(request: Request): Promise<Response> {
  const originError = rejectUntrustedOrigin(request);
  if (originError) return originError;
  try {
    const { userId, organization } = await getAuthenticatedOrganizationContext(request);
    assertWebsiteAdminAccess({ userId, organizationId: organization.id, role: organization.role, active: true }, organization.id, 'register');
    const body = await readBoundedJson(request);
    if (body.error) return body.error;
    const parsed = registerSchema.safeParse(body.value);
    if (!parsed.success) return Response.json({ ok: false, code: 'INVALID_WEBSITE' }, { status: 400 });
    if (parsed.data.organizationId !== organization.id)
      return Response.json({ ok: false, code: 'ORGANIZATION_SCOPE_CHANGED' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
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
