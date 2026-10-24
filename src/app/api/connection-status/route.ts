import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { pageError } from '../../../server/organization-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Legacy endpoint: no outbound probe and no configuration disclosure. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    return Response.json({ ok: true, organizationId: organization.id,
      connection: 'unknown', reason: 'NO_PERSISTED_HEALTH_CHECK',
      detail: 'Use organization-connectors for per-website evidence.' },
    { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return pageError(error); }
}
