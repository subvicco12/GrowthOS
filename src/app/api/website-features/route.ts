import { randomUUID } from 'node:crypto';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { canDisableWebsiteFeature, websiteFeaturePatchSchema } from '../../../core/website-feature-controls';

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
    const { userId, organization } = await getAuthenticatedOrganizationContext(request);
    if (!canDisableWebsiteFeature(organization.role))
      return Response.json({ ok: false, code: 'INSUFFICIENT_ROLE' }, { status: 403 });
    const declaredLength = request.headers.get('content-length');
    if (declaredLength !== null && (!/^\\d+$/.test(declaredLength) || Number(declaredLength) > 4096))
      return Response.json({ ok: false, code: 'REQUEST_TOO_LARGE' }, { status: 413 });
    let raw: unknown;
    try {
      const body = await request.text();
      if (Buffer.byteLength(body, 'utf8') > 4096)
        return Response.json({ ok: false, code: 'REQUEST_TOO_LARGE' }, { status: 413 });
      raw = JSON.parse(body);
    } catch {
      return Response.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 });
    }
    const parsed = websiteFeaturePatchSchema.safeParse(raw);
    if (!parsed.success) return Response.json({ ok: false, code: 'INVALID_FEATURE_CHANGE' }, { status: 400 });
    const column = parsed.data.feature === 'automation' ? 'automation_enabled' : 'auto_publish_enabled';
    const connection = await getMySQLPool().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT ' + column + ' AS enabled FROM growth_websites WHERE id=? AND organization_id=? FOR UPDATE',
        [parsed.data.websiteId, organization.id]
      );
      const websiteRows = rows as Array<{ enabled: number | boolean }>;
      if (websiteRows.length === 0) {
        await connection.rollback();
        return Response.json({ ok: false, code: 'WEBSITE_NOT_FOUND' }, { status: 404 });
      }
      if (Boolean(websiteRows[0].enabled)) {
        await connection.execute(
          'UPDATE growth_websites SET ' + column + '=FALSE WHERE id=? AND organization_id=?',
          [parsed.data.websiteId, organization.id]
        );
        await connection.execute(
          'INSERT INTO growth_website_feature_audit (id,organization_id,website_id,actor_id,feature,enabled) VALUES (?,?,?,?,?,FALSE)',
          [randomUUID(), organization.id, parsed.data.websiteId, userId, parsed.data.feature]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
