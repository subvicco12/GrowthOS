import type { RowDataPacket } from 'mysql2/promise';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type AuditRow = RowDataPacket & { id: string; website_id: string; actor_id: string; feature: string; created_at: Date };
type DecisionRow = RowDataPacket & { id: string; website_id: string; actor_id: string; decision: string; created_at: Date };

/** Selected organization comes only from a verified session and membership. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const pool = getMySQLPool();
    const [features] = await pool.execute<AuditRow[]>(
      'SELECT id,website_id,actor_id,feature,created_at FROM growth_website_feature_audit WHERE organization_id=? ORDER BY created_at DESC,id DESC LIMIT 100',
      [organization.id]
    );
    const [decisions] = await pool.execute<DecisionRow[]>(
      'SELECT id,website_id,actor_id,decision,created_at FROM growth_approval_decisions WHERE organization_id=? ORDER BY created_at DESC,id DESC LIMIT 100',
      [organization.id]
    );
    return Response.json({ ok: true, features, decisions, limitedToLatest100PerType: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'AUTHENTICATION_REQUIRED' ? 401 :
      code === 'ORGANIZATION_REQUIRED' || code === 'ORGANIZATION_FORBIDDEN' ? 403 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
