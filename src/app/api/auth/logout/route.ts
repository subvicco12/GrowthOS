import { rejectUntrustedOrigin } from '../../../../server/request-security';
import { cookies } from 'next/headers';
import { revokeMySQLSession } from '../../../../server/mysql-session';
import { SESSION_COOKIE_NAME } from '../../../../server/authenticated-website-access';
import { ORGANIZATION_COOKIE_NAME } from '../../../../server/organization-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const originError = rejectUntrustedOrigin(request);
  if (originError) return originError;
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE_NAME)?.value;
    if (token) await revokeMySQLSession(token);
    store.delete(SESSION_COOKIE_NAME);
    store.delete(ORGANIZATION_COOKIE_NAME);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, code: 'SERVICE_UNAVAILABLE' },\n      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
