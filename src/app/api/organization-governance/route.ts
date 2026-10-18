import type { RowDataPacket } from 'mysql2/promise';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { nextPageCursor, PAGE_SIZE, pageError, readPageCursor } from '../../../server/organization-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type AuditRow = RowDataPacket & { id: string; created_at: Date; cursor_created_at: string };

/** Selected organization comes only from a verified session and membership. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const stream = new URL(request.url).searchParams.get('stream');
    if (stream !== 'features' && stream !== 'decisions') throw Error('INVALID_CURSOR');
    const cursor = readPageCursor(request, organization.id, stream);
    const table = stream === 'features' ? 'growth_website_feature_audit' : 'growth_approval_decisions';
    const fields = stream === 'features' ? 'id,website_id,actor_id,feature,created_at' : 'id,website_id,actor_id,decision,created_at';
    const [rows] = await getMySQLPool().execute<AuditRow[]>(
      `SELECT ${fields},DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS cursor_created_at FROM ${table} WHERE organization_id=?` +
        (cursor ? ' AND (created_at<? OR (created_at=? AND id<?))' : '') + ' ORDER BY created_at DESC,id DESC LIMIT ?',
      cursor ? [organization.id, cursor.key, cursor.key, cursor.id, PAGE_SIZE + 1] : [organization.id, PAGE_SIZE + 1]
    );
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return Response.json({ ok: true, stream, items: page.map(({ cursor_created_at: _cursor, ...item }) => item),
      nextCursor: rows.length > PAGE_SIZE && last ? nextPageCursor(organization.id, stream, last.cursor_created_at, last.id) : null },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return pageError(error);
  }
}
