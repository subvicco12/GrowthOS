import type { GrowthSiteDefinition } from './portfolio';

export interface SiteRegistryRepository {
  list(): Promise<readonly GrowthSiteDefinition[]>;
}

export async function loadPortfolio(
  repository: SiteRegistryRepository,
  fallback: readonly GrowthSiteDefinition[],
): Promise<{ sites: readonly GrowthSiteDefinition[]; source: 'database'|'fallback' }> {
  try {
    const sites = await repository.list();
    if (sites.length === 0) return {sites:fallback,source:'fallback'};
    const domains = new Set<string>();
    for (const site of sites) {
      const domain=site.domain.trim().toLowerCase();
      if (!domain || domains.has(domain)) throw new Error('INVALID_SITE_REGISTRY');
      domains.add(domain);
    }
    return {sites,source:'database'};
  } catch {
    return {sites:fallback,source:'fallback'};
  }
}
