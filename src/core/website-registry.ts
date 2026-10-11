/** Growth OS website registry domain rules. Persistence and authorization belong to the API layer. */
export type WebsiteStatus = 'draft' | 'verifying' | 'connected' | 'auditing' | 'active' | 'paused' | 'archived';
export type WebsitePlatform = 'wordpress' | 'nextjs' | 'react' | 'static' | 'custom';
export interface RegisteredWebsite {
  id: string;
  organizationId: string;
  domain: string;
  platform: WebsitePlatform;
  status: WebsiteStatus;
  timezone: string;
  verifiedAt: string | null;
  createdAt: string;
}
export interface WebsiteRegistrationInput {
  organizationId: string;
  domain: string;
  platform: WebsitePlatform;
  timezone: string;
}
export interface WebsiteRegistrationDefaults {
  automationEnabled: false;
  autoPublishEnabled: false;
  weeklyProductionLimit: 0;
  monthlyBudgetMinor: 0;
}
export const NEW_WEBSITE_DEFAULTS: WebsiteRegistrationDefaults = Object.freeze({
  automationEnabled: false,
  autoPublishEnabled: false,
  weeklyProductionLimit: 0,
  monthlyBudgetMinor: 0
});
export function normalizeDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw || /[\s/@?#]/.test(raw)) throw new Error('INVALID_DOMAIN');
  const url = new URL('https://' + raw);
  if (url.hostname !== raw || url.port || !raw.includes('.') || raw.startsWith('.') || raw.endsWith('.')) {
    throw new Error('INVALID_DOMAIN');
  }
  if (!/^[a-z0-9.-]+$/.test(raw) || raw.split('.').some(part => !part || part.startsWith('-') || part.endsWith('-'))) {
    throw new Error('INVALID_DOMAIN');
  }
  return raw;
}
export function registerWebsite(input: WebsiteRegistrationInput, id: string, now: string): RegisteredWebsite {
  if (!input.organizationId.trim() || !id.trim()) throw new Error('INVALID_SCOPE');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); }
  catch { throw new Error('INVALID_TIMEZONE'); }
  return {
    id, organizationId: input.organizationId, domain: normalizeDomain(input.domain),
    platform: input.platform, timezone: input.timezone, status: 'draft',
    verifiedAt: null, createdAt: now
  };
}
export function canActivateWebsite(site: RegisteredWebsite, verifiedOrganizationId: string): boolean {
  return site.organizationId === verifiedOrganizationId && site.verifiedAt !== null &&
    (site.status === 'connected' || site.status === 'auditing' || site.status === 'paused');
}
export function assertWebsiteScope(site: RegisteredWebsite, organizationId: string): void {
  if (site.organizationId !== organizationId) throw new Error('WEBSITE_ACCESS_DENIED');
}
