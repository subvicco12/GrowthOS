import { getAuthenticatedOrganizationChoices } from '../../../server/organization-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const { organizations } = await getAuthenticatedOrganizationChoices(request);
    return Response.json({ ok: true, organizations }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SERVICE_UNAVAILABLE';
    const unauthenticated = code === 'AUTHENTICATION_REQUIRED';
    return Response.json({ ok: false, code: unauthenticated ? code : 'SERVICE_UNAVAILABLE' }, {
      status: unauthenticated ? 401 : 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
}
