import type { RowDataPacket } from 'mysql2/promise';
import { requireWebsiteAccess } from '../../../../server/authenticated-website-access';
import { getMySQLPool } from '../../../../server/mysql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type ApprovalRow = RowDataPacket & {
  id: string; website_id: string; title: string; action_type: string;
  status: string; created_at: Date;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const organizationId = params.get('organizationId') ?? '';
  const websiteId = params.get('websiteId');
  if (!uuid.test(organizationId) || (websiteId !== null && !uuid.test(websiteId))) {
    return Response.json({ ok: false, code: 'INVALID_SCOPE' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    await requireWebsiteAccess(organizationId, 'read');
    const [rows] = websiteId
      ? await getMySQLPool().execute<ApprovalRow[]>(
        'SELECT id,website_id,title,action_type,status,created_at FROM growth_approval_queue WHERE organization_id=? AND website_id=? ORDER BY created_at DESC LIMIT 100',
        [organizationId, websiteId])
      : await getMySQLPool().execute<ApprovalRow[]>(
        'SELECT id,website_id,title,action_type,status,created_at FROM growth_approval_queue WHERE organization_id=? ORDER BY created_at DESC LIMIT 100',
        [organizationId]);
    return Response.json({ ok: true, approvals: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'UNAUTHENTICATED' ? 401 :
      code === 'UNAUTHORIZED_ORGANIZATION' || code === 'INSUFFICIENT_ROLE' ? 403 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
