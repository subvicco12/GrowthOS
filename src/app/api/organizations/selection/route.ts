import { getAuthenticatedOrganizationChoices, getAuthenticatedOrganizationContext, ORGANIZATION_COOKIE_NAME } from '../../../../server/organization-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    return Response.json({ ok: true, organization }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SERVICE_UNAVAILABLE';
    const status = code === 'AUTHENTICATION_REQUIRED' ? 401 : code === 'ORGANIZATION_REQUIRED' || code === 'ORGANIZATION_FORBIDDEN' ? 403 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

/** Only switches scope; does not grant permissions. Every subsequent operation must recheck membership. */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return Response.json({ ok: false, code: 'ORIGIN_REQUIRED' }, { status: 403 });
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.host !== host) return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 });
  } catch { return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 }); }
  try {
    const { organizations } = await getAuthenticatedOrganizationChoices(request);
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return Response.json({ ok: false, code: 'INVALID_REQUEST' }, { status: 400 });
    const body = raw as Record<string, unknown>;
    if (Object.keys(body).length !== 1 || typeof body.organizationId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.organizationId)) return Response.json({ ok: false, code: 'INVALID_REQUEST' }, { status: 400 });
    if (!organizations.some(o => o.id === body.organizationId)) return Response.json({ ok: false, code: 'ORGANIZATION_FORBIDDEN' }, { status: 403 });
    const response = Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', ORGANIZATION_COOKIE_NAME + '=' + encodeURIComponent(body.organizationId) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200');
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return Response.json({ ok: false, code: code === 'AUTHENTICATION_REQUIRED' ? code : 'SERVICE_UNAVAILABLE' }, { status: code === 'AUTHENTICATION_REQUIRED' ? 401 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
