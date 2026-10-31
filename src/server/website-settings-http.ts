import { z } from 'zod';
import { websiteSettingsPatchSchema } from '../core/website-settings';
import type { WebsiteSettingsStore, ShutdownPosition } from './mysql-website-settings';
import { rejectUntrustedOrigin, readBoundedJson } from './request-security';

const scopeSchema = z.object({ organizationId: z.string().uuid(), websiteId: z.string().uuid(), cursor: z.string().max(600).optional() }).strict();
const cursorSchema = z.object({ organizationId: z.string().uuid(), websiteId: z.string().uuid(),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/), id: z.string().uuid() }).strict();
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const failure = (error: unknown) => {
  const code = error instanceof Error ? error.message : '';
  const statuses: Record<string, number> = { AUTHENTICATION_REQUIRED: 401, ORGANIZATION_REQUIRED: 403, ORGANIZATION_FORBIDDEN: 403,
    ORGANIZATION_SCOPE_CHANGED: 403, INSUFFICIENT_ROLE: 403, WEBSITE_NOT_FOUND: 404, INVALID_CURSOR: 400,
    SETTINGS_CONFLICT: 409, METADATA_LOCKED: 409, INVALID_TRANSITION: 409 };
  return json({ ok: false, code: statuses[code] ? code : 'SERVICE_UNAVAILABLE' }, statuses[code] || 503);
};
type Context = { userId: string; organization: { id: string; role: string } };

/** Injected dependencies let HTTP authorization/error handling run in offline tests without fake SQL results. */
export function createWebsiteSettingsHandlers(context: (request: Request) => Promise<Context>, store: () => WebsiteSettingsStore) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        const { organization } = await context(request);
        const url = new URL(request.url);
        if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return json({ ok: false, code: 'INVALID_SCOPE' }, 400);
        const parsed = scopeSchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return json({ ok: false, code: 'INVALID_SCOPE' }, 400);
        const { organizationId, websiteId, cursor } = parsed.data;
        if (organizationId !== organization.id) throw Error('ORGANIZATION_SCOPE_CHANGED');
        let position: ShutdownPosition | null = null;
        if (cursor !== undefined) {
          try {
            if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw Error();
            const bytes = Buffer.from(cursor, 'base64url');
            if (bytes.toString('base64url') !== cursor) throw Error();
            const decoded = cursorSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
            if (decoded.organizationId !== organizationId || decoded.websiteId !== websiteId) throw Error();
            position = { at: decoded.at, id: decoded.id };
          } catch { throw Error('INVALID_CURSOR'); }
        }
        const adapter = store();
        const website = await adapter.read(organizationId, websiteId);
        const history = await adapter.history(organizationId, websiteId, position);
        return json({ ok: true, organizationId, website, history: history.items,
          nextCursor: history.next ? Buffer.from(JSON.stringify({ organizationId, websiteId, ...history.next })).toString('base64url') : null });
      } catch (error) { return failure(error); }
    },
    async PATCH(request: Request): Promise<Response> {
      const originError = rejectUntrustedOrigin(request);
      if (originError) return originError;
      try {
        const { userId, organization } = await context(request);
        if (!['owner', 'admin'].includes(organization.role)) throw Error('INSUFFICIENT_ROLE');
        const body = await readBoundedJson(request);
        if (body.error) return body.error;
        const parsed = websiteSettingsPatchSchema.safeParse(body.value);
        if (!parsed.success) return json({ ok: false, code: 'INVALID_SETTINGS' }, 400);
        if (parsed.data.organizationId !== organization.id) throw Error('ORGANIZATION_SCOPE_CHANGED');
        const website = await store().update(organization.id, userId, parsed.data);
        return json({ ok: true, organizationId: organization.id, website });
      } catch (error) { return failure(error); }
    }
  };
}
