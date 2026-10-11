import { z } from 'zod';
import { requireWebsiteAccess } from '../../../../../server/authenticated-website-access';
import { registerMySQLWebsite } from '../../../../../server/mysql-website-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  organizationId: z.string().uuid(),
  domain: z.string().min(3).max(253),
  platform: z.enum(['wordpress', 'nextjs', 'react', 'static', 'custom']),
  timezone: z.string().min(1).max(80)
}).strict();

export async function POST(request: Request): Promise<Response> {
  // Defense-in-depth for cookie-authenticated writes; never rely on SameSite alone.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return Response.json({ ok: false, code: 'ORIGIN_REQUIRED' }, { status: 403 });
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== 'https:' || parsedOrigin.host !== host) {
      return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 });
    }
  } catch {
    return Response.json({ ok: false, code: 'ORIGIN_FORBIDDEN' }, { status: 403 });
  }
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return Response.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 }); }
  const input = schema.safeParse(payload);
  if (!input.success) return Response.json({ ok: false, code: 'INVALID_WEBSITE' }, { status: 400 });
  try {
    await requireWebsiteAccess(input.data.organizationId, 'register');
    const websiteId = await registerMySQLWebsite(input.data);
    return Response.json({ ok: true, websiteId, status: 'draft', automationEnabled: false, autoPublishEnabled: false },
      { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const status = code === 'UNAUTHENTICATED' ? 401 :
      code === 'UNAUTHORIZED_ORGANIZATION' || code === 'INSUFFICIENT_ROLE' ? 403 :
      code === 'INVALID_DOMAIN' || code === 'INVALID_TIMEZONE' ? 400 : 503;
    return Response.json({ ok: false, code: status === 503 ? 'SERVICE_UNAVAILABLE' : code },
      { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
