import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import type { RowDataPacket } from 'mysql2/promise';
import { nextPageCursor, PAGE_SIZE, pageError, readPageCursor } from '../../../server/organization-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ApprovalRow = RowDataPacket & {
  id: string; website_id: string; title: string; action_type: string; status: string; created_at: Date; cursor_created_at: string;
};

/** Tenant-scoped pending queue; decisions use the separately authorized internal endpoint. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const cursor = readPageCursor(request, organization.id, 'approvals');
    const [rows] = await getMySQLPool().execute<ApprovalRow[]>(
      "SELECT id,website_id,title,action_type,status,created_at,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS cursor_created_at FROM growth_approval_queue WHERE organization_id=? AND status=?" +
        (cursor ? ' AND (created_at>? OR (created_at=? AND id>?))' : '') + ' ORDER BY created_at,id LIMIT ?',
      cursor ? [organization.id, 'pending', cursor.key, cursor.key, cursor.id, PAGE_SIZE + 1] : [organization.id, 'pending', PAGE_SIZE + 1]
    );
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return Response.json({ ok: true, items: page.map(({ cursor_created_at: _cursor, ...item }) => item), role: organization.role,
      internalDecisionsAvailable: ['owner','admin','editor'].includes(organization.role),
      nextCursor: rows.length > PAGE_SIZE && last ? nextPageCursor(organization.id, 'approvals', last.cursor_created_at, last.id) : null },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return pageError(error);
  }
}
