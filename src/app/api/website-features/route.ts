import { getAuthenticatedOrganizationContext } from '../../../../server/organization-context';
import { getMySQLPool } from '../../../../server/mysql';
import { canDisableWebsiteFeature, websiteFeaturePatchSchema } from '../../../../core/website-feature-controls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Disabling is the only allowed mutation. This route cannot enable jobs or publishing. */
export async function PATCH(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  try {
    if (!origin || !host || new URL(origin).protocol !== 'https:' || new URL(origin).host !== host)
      return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 });
  } catch { return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 }); }
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    if (!canDisableWebsiteFeature(organization.role))
      return Response.json({ ok: false, code: 'INSUFFICIENT_ROLE' }, { status: 403 });
    const parsed = websiteFeaturePatchSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ ok: false, code: 'INVALID_FEATURE_CHANGE' }, { status: 400 });
    const column = parsed.data.feature === 'automation' ? 'automation_enabled' : 'auto_publish_enabled';
    const [result] = await getMySQLPool().execute(
      'UPDATE growth_websites SET ' + column + '=FALSE WHERE id=? AND organization_id=?',
      [parsed.data.websiteId, organization.id]
    );
    const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
    if (!affected) return Response.json({ ok: false, code: 'WEBSITE_NOT_FOUND' }, { status: 404 });
    return Response.json({ ok: true, websiteId: parsed.data.websiteId, feature: parsed.data.feature, enabled: false },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTHENTICATION_REQUIRED' ? 401 :
      code === 'ORGANIZATION_REQUIRED' || code === 'ORGANIZATION_FORBIDDEN' ? 403 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
