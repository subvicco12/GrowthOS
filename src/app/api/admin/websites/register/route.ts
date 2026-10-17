import { rejectUntrustedOrigin, readBoundedJson } from '../../../../../server/request-security';
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
  const originError = rejectUntrustedOrigin(request);
  if (originError) return originError;
  const body = await readBoundedJson(request);
  if (body.error) return body.error;
  const input = schema.safeParse(body.value);
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
