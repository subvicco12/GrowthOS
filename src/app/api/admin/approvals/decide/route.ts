import { z } from 'zod';
import { requireWebsiteAccess } from '../../../../../server/authenticated-website-access';
import { decideInternalApproval } from '../../../../../server/mysql-approval-decision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({
  organizationId: z.string().uuid(),
  websiteId: z.string().uuid(),
  approvalId: z.string().uuid(),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
  decision: z.enum(['approved','rejected','deferred']),
  note: z.string().max(2000).optional()
}).strict();

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.GROWTHOS_APP_ORIGIN;
  const origin = request.headers.get('origin');
  if (!expected || !origin || !expected.startsWith('https://') || origin !== expected) {
    return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > 4096) {
    return Response.json({ ok: false, code: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }
  let payload: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > 4096) {
      return Response.json({ ok: false, code: 'REQUEST_TOO_LARGE' }, { status: 413 });
    }
    payload = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return Response.json({ ok: false, code: 'INVALID_DECISION' }, { status: 400 });
  try {
    const actor = await requireWebsiteAccess(parsed.data.organizationId, 'publish');
    const result = await decideInternalApproval({ ...parsed.data, actorId: actor.userId });
    return Response.json({ ok: true, ...result, externalAction: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'UNAUTHENTICATED' ? 401 :
      code === 'UNAUTHORIZED_ORGANIZATION' || code === 'INSUFFICIENT_ROLE' ? 403 :
      code === 'APPROVAL_NOT_FOUND' ? 404 :
      code === 'APPROVAL_ALREADY_DECIDED' || code === 'IDEMPOTENCY_CONFLICT' ? 409 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
