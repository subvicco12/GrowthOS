import { z } from 'zod';
import { loginWithPassword } from '../../../../server/mysql-login';
import { SESSION_COOKIE_NAME } from '../../../../server/authenticated-website-access';
import { ORGANIZATION_COOKIE_NAME } from '../../../../server/organization-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024)
}).strict();

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return Response.json({ ok: false, code: 'ORIGIN_REQUIRED' }, { status: 403 });
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.host !== host) {
      return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 });
    }
  } catch {
    return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 });
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return Response.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 }); }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ ok: false, code: 'INVALID_CREDENTIALS' }, { status: 401 });
  try {
    const { token, expiresAt } = await loginWithPassword(parsed.data.email, parsed.data.password);
    const response = Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie',
      `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`);
    response.headers.append('Set-Cookie', `${ORGANIZATION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SERVICE_UNAVAILABLE';
    const status = code === 'LOGIN_THROTTLED' ? 429 : code === 'INVALID_CREDENTIALS' ? 401 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : status === 429 ? 'LOGIN_THROTTLED' : 'INVALID_CREDENTIALS' },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
