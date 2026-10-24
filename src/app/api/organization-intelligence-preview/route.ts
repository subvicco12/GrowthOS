import type { RowDataPacket } from 'mysql2/promise';
import { previewInput, manualIntelligencePreview } from '../../../core/manual-intelligence-preview';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { rejectUntrustedOrigin, readBoundedJson } from '../../../server/request-security';
import { pageError } from '../../../server/organization-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Website = RowDataPacket & { domain: string };

/** Preview only; requires a currently accessible organization and website. Never fetches URLs. */
export async function POST(request: Request): Promise<Response> {
  const originError = rejectUntrustedOrigin(request);
  if (originError) return originError;
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const body = await readBoundedJson(request);
    if (body.error) return body.error;
    const parsed = previewInput.safeParse(body.value);
    if (!parsed.success) return Response.json({ ok: false, code: 'INVALID_EVIDENCE' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    const [rows] = await getMySQLPool().execute<Website[]>(
      'SELECT domain FROM growth_websites WHERE organization_id=? AND id=? LIMIT 1',
      [organization.id, parsed.data.websiteId]);
    if (!rows.length) return Response.json({ ok: false, code: 'WEBSITE_NOT_FOUND' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    try {
      return Response.json({ ok: true, organizationId: organization.id, websiteId: parsed.data.websiteId,
        ...manualIntelligencePreview(parsed.data, rows[0].domain) }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ ok: false, code: 'EVIDENCE_SCOPE_MISMATCH' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
  } catch (error) { return pageError(error); }
}
