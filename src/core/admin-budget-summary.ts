import type { RegisteredWebsite } from './website-registry';
import type { WebsiteContentPolicy } from './production-policy';

export function summarizeWebsiteBudget(site: RegisteredWebsite, policies: readonly WebsiteContentPolicy[], organizationId: string) {
  if (site.organizationId !== organizationId) throw new Error('WEBSITE_ACCESS_DENIED');
  const own = policies.filter(p => p.websiteId === site.id && p.organizationId === organizationId && p.enabled);
  return {
    websiteId: site.id,
    domain: site.domain,
    status: site.status,
    verified: site.verifiedAt !== null,
    enabledContentTypes: own.length,
    weeklyUnits: own.reduce((sum, p) => sum + p.weeklyLimit, 0),
    configuredMonthlyMinor: own.reduce((sum, p) => sum + p.monthlyBudgetMinor, 0)
  };
}
