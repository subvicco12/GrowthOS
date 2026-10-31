import { z } from 'zod';
import type { WebsiteSummary } from './workspace-journey';

export const websitePlatformSchema = z.enum(['wordpress', 'nextjs', 'react', 'static', 'custom']);
export const websiteTimezoneSchema = z.string().min(1).max(80).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return value === value.trim(); }
  catch { return false; }
}, 'Use a valid IANA timezone');
const scope = { organizationId: z.string().uuid(), websiteId: z.string().uuid(), expectedState: z.string().regex(/^[a-f0-9]{64}$/) };
export const websiteSettingsPatchSchema = z.discriminatedUnion('action', [
  z.object({ ...scope, action: z.literal('metadata'), platform: websitePlatformSchema, timezone: websiteTimezoneSchema }).strict(),
  z.object({ ...scope, action: z.literal('lifecycle'), status: z.enum(['paused', 'archived', 'draft']) }).strict()
]);
export type WebsiteSettingsPatch = z.infer<typeof websiteSettingsPatchSchema>;
export type WebsiteSettings = WebsiteSummary & { timezone: string; stateToken: string };
export type ShutdownEvent = { id: string; actorId: string; feature: 'automation' | 'auto_publish'; createdAt: string };
export type WebsiteSettingsPage = { ok: true; organizationId: string; website: WebsiteSettings; history: ShutdownEvent[]; nextCursor: string | null };

/** Metadata changes must not reinterpret existing verified-site connector or quota authority. */
export function assertWebsiteSettingsChange(site: Pick<WebsiteSettings, 'status' | 'verifiedAt'>, patch: WebsiteSettingsPatch): void {
  if (patch.action === 'metadata') {
    if (site.status !== 'draft' || site.verifiedAt !== null) throw Error('METADATA_LOCKED');
    return;
  }
  if (patch.status === 'draft' && !['paused', 'archived', 'draft'].includes(site.status)) throw Error('INVALID_TRANSITION');
  if (patch.status === 'paused' && site.status === 'archived') throw Error('INVALID_TRANSITION');
}

const settingsResponseSchema = z.object({
  id: z.string().uuid(), domain: z.string().min(1).max(253), platform: websitePlatformSchema,
  status: z.enum(['draft', 'verifying', 'connected', 'auditing', 'active', 'paused', 'archived']),
  timezone: websiteTimezoneSchema, stateToken: z.string().regex(/^[a-f0-9]{64}$/),
  verifiedAt: z.string().datetime({ offset: true }).nullable(), automationEnabled: z.boolean(), autoPublishEnabled: z.boolean(),
  monthlyBudgetMinor: z.string().regex(/^(0|[1-9]\d{0,19})$/)
});
export function readWebsiteSettingsResponse(raw: unknown, organizationId: string, websiteId: string): WebsiteSettings {
  const parsed = z.object({ ok: z.literal(true), organizationId: z.literal(organizationId), website: settingsResponseSchema }).parse(raw);
  if (parsed.website.id !== websiteId) throw Error('SETTINGS_SCOPE_MISMATCH');
  return parsed.website;
}
export function readWebsiteSettingsPage(raw: unknown, organizationId: string, websiteId: string): WebsiteSettingsPage {
  const website = readWebsiteSettingsResponse(raw, organizationId, websiteId);
  const page = z.object({ history: z.array(z.object({ id: z.string().uuid(), actorId: z.string().uuid(),
    feature: z.enum(['automation', 'auto_publish']), createdAt: z.string().datetime({ offset: true }) })).max(25),
    nextCursor: z.string().regex(/^[A-Za-z0-9_-]{1,600}$/).nullable() }).parse(raw);
  return { ok: true, organizationId, website, ...page };
}
