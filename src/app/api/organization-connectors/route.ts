import type { RowDataPacket } from 'mysql2/promise';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { nextPageCursor, PAGE_SIZE, pageError, readPageCursor } from '../../../server/organization-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Row = RowDataPacket & { id: string; domain: string; platform: string };
export type ConnectorState = 'unknown' | 'disconnected' | 'unavailable';

/** No persisted connector probe exists. A configured platform is never evidence of health. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const cursor = readPageCursor(request, organization.id, 'websites');
    const [rows] = await getMySQLPool().execute<Row[]>(
      'SELECT id,domain,platform FROM growth_websites WHERE organization_id=?' +
        (cursor ? ' AND (domain>? OR (domain=? AND id>?))' : '') + ' ORDER BY domain,id LIMIT ?',
      cursor ? [organization.id, cursor.key, cursor.key, cursor.id, PAGE_SIZE + 1] : [organization.id, PAGE_SIZE + 1]
    );
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return Response.json({ ok: true, connectors: page.map(row => ({
      websiteId: row.id, domain: row.domain, platform: row.platform,
      state: 'unknown' as ConnectorState, checkedAt: null, reason: 'NO_PERSISTED_HEALTH_CHECK'
    })), nextCursor: rows.length > PAGE_SIZE && last ? nextPageCursor(organization.id, 'websites', last.domain, last.id) : null,
    disconnectedRequiresExplicitPersistedEvidence: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return pageError(error); }
}
