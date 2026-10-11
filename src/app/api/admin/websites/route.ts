import { requireWebsiteAccess } from '../../../../server/authenticated-website-access';
import { listMySQLWebsites } from '../../../../server/mysql-website-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const organizationId = new URL(request.url).searchParams.get('organizationId') || '';
  if (!organizationId || organizationId.length > 64) {
    return Response.json({ ok: false, code: 'INVALID_ORGANIZATION' }, { status: 400 });
  }
  try {
    await requireWebsiteAccess(organizationId, 'read');
    const websites = await listMySQLWebsites(organizationId);
    return Response.json({ ok: true, websites }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const status = code === 'UNAUTHENTICATED' ? 401 :
      code === 'UNAUTHORIZED_ORGANIZATION' || code === 'INSUFFICIENT_ROLE' ? 403 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
