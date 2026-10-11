import { requireWebsiteAccess } from '../../../../server/authenticated-website-access';
import { listMySQLWebsiteBudgets } from '../../../../server/mysql-budget-overview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const organizationId = new URL(request.url).searchParams.get('organizationId') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
    return Response.json({ ok: false, code: 'INVALID_ORGANIZATION' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    await requireWebsiteAccess(organizationId, 'read');
    const budgets = await listMySQLWebsiteBudgets(organizationId);
    return Response.json({ ok: true, budgets }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const status = code === 'UNAUTHENTICATED' ? 401 :
      code === 'UNAUTHORIZED_ORGANIZATION' || code === 'INSUFFICIENT_ROLE' ? 403 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
