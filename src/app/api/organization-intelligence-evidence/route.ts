import { z } from 'zod';
import { previewInput } from '../../../core/manual-intelligence-preview';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { MySQLManualEvidenceStore } from '../../../server/mysql-intelligence-evidence';
import { rejectUntrustedOrigin, readBoundedJson } from '../../../server/request-security';
import { pageError } from '../../../server/organization-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = z.string().uuid();
const ingest = previewInput.extend({ idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
  sourceLabel: z.string().trim().min(1).max(200), observedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }) }).strict();
const revoke = z.object({ websiteId: uuid, evidenceId: uuid }).strict();
const headers = { 'Cache-Control': 'no-store' };

function failure(error: unknown): Response {
  const code = error instanceof Error ? error.message : '';
  if (code === 'EVIDENCE_COMMIT_UNKNOWN') return Response.json({ ok: false, code: 'EVIDENCE_OUTCOME_UNKNOWN_OPERATOR_HOLD' }, { status: 503, headers });
  if (code === 'WEBSITE_NOT_FOUND' || code === 'EVIDENCE_NOT_FOUND') return Response.json({ ok: false, code }, { status: 404, headers });
  if (code === 'EVIDENCE_IDEMPOTENCY_CONFLICT' || code === 'EVIDENCE_REVOKED') return Response.json({ ok: false, code }, { status: 409, headers });
  if (code === 'EVIDENCE_TIME_INVALID' || code === 'EVIDENCE_SCOPE_MISMATCH') return Response.json({ ok: false, code }, { status: 400, headers });
  return pageError(error);
}
/** Listing is tenant-scoped, bounded and always labels manual evidence unverified. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const websiteId = uuid.safeParse(new URL(request.url).searchParams.get('websiteId'));
    if (!websiteId.success) return Response.json({ ok: false, code: 'INVALID_WEBSITE' }, { status: 400, headers });
    const items = await new MySQLManualEvidenceStore(getMySQLPool()).list(organization.id,websiteId.data);
    return Response.json({ ok: true, organizationId: organization.id, websiteId: websiteId.data,
      items, nextCursor: null, verifiedEvidenceAvailable: false }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request): Promise<Response> {
  const originError = rejectUntrustedOrigin(request);
  if (originError) return originError;
  try {
    const { userId, organization } = await getAuthenticatedOrganizationContext(request);
    if (!['owner','admin','editor'].includes(organization.role)) return Response.json({ ok: false, code: 'FORBIDDEN' }, { status: 403, headers });
    const body = await readBoundedJson(request); if (body.error) return body.error;
    const parsed = ingest.safeParse(body.value);
    if (!parsed.success) return Response.json({ ok: false, code: 'INVALID_EVIDENCE' }, { status: 400, headers });
    const result = await new MySQLManualEvidenceStore(getMySQLPool()).record({ ...parsed.data,
      organizationId: organization.id, actorId: userId });
    return Response.json({ ok: true, id: result.id, duplicate: result.duplicate, verificationStatus: 'unverified' },
      { status: result.duplicate ? 200 : 201, headers });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request): Promise<Response> {
  const originError = rejectUntrustedOrigin(request);
  if (originError) return originError;
  try {
    const { userId, organization } = await getAuthenticatedOrganizationContext(request);
    if (!['owner','admin'].includes(organization.role)) return Response.json({ ok: false, code: 'FORBIDDEN' }, { status: 403, headers });
    const body = await readBoundedJson(request); if (body.error) return body.error;
    const parsed = revoke.safeParse(body.value);
    if (!parsed.success) return Response.json({ ok: false, code: 'INVALID_EVIDENCE' }, { status: 400, headers });
    const changed = await new MySQLManualEvidenceStore(getMySQLPool()).revoke({ organizationId: organization.id,
      websiteId: parsed.data.websiteId, evidenceId: parsed.data.evidenceId, actorId: userId });
    return Response.json({ ok: true, revoked: true, alreadyRevoked: !changed }, { headers });
  } catch (error) { return failure(error); }
}
