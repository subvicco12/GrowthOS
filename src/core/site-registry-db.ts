import type { GrowthSiteDefinition } from './portfolio';
import type { SiteRegistryRepository } from './site-registry';

export interface SiteRegistryRow {
  name: string;
  domain: string;
  status: 'active'|'paused'|'maintenance'|'disconnected';
}

export interface SiteRegistryDataSource {
  listSites(): Promise<readonly SiteRegistryRow[]>;
}

function mapStatus(status: SiteRegistryRow['status']): GrowthSiteDefinition['status'] {
  if (status === 'active') return 'connected';
  if (status === 'disconnected') return 'ready_to_connect';
  if (status === 'paused') return 'disabled';
  return 'degraded';
}

export class DatabaseSiteRegistryRepository implements SiteRegistryRepository {
  constructor(private readonly source: SiteRegistryDataSource) {}

  async list(): Promise<readonly GrowthSiteDefinition[]> {
    const rows = await this.source.listSites();
    return rows.map(row => ({
      name: row.name.trim(),
      domain: row.domain.trim().toLowerCase(),
      status: mapStatus(row.status),
    }));
  }
}
