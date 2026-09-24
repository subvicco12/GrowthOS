export type WorkspaceKey =
  | 'portfolio' | 'website-overview' | 'features' | 'competitors'
  | 'plans' | 'qa' | 'seo' | 'growth' | 'revenue'
  | 'engineering' | 'approvals' | 'settings';

export interface GrowthSiteDefinition {
  name: string;
  domain: string;
  status: 'ready_to_connect' | 'connected' | 'degraded' | 'disabled';
}

export const growthSites: readonly GrowthSiteDefinition[] = [
  { name: 'BarcodeQRHub', domain: 'barcodeqrhub.com', status: 'ready_to_connect' },
  { name: 'PriceInsight360', domain: 'priceinsight360.com', status: 'ready_to_connect' },
  { name: 'BusinessStartTools', domain: 'businessstarttools.com', status: 'ready_to_connect' },
  { name: 'AI Tool Stores', domain: 'aitoolstores.com', status: 'ready_to_connect' },
  { name: 'PDF Image Tools', domain: 'pdfimagetools.online', status: 'ready_to_connect' },
  { name: 'CalcuMint', domain: 'calcumint.com', status: 'ready_to_connect' },
] as const;

export const growthWorkspaces: readonly { key: WorkspaceKey; label: string }[] = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'website-overview', label: 'Website Overview' },
  { key: 'features', label: 'Features' },
  { key: 'competitors', label: 'Competitors' },
  { key: 'plans', label: 'Plans' },
  { key: 'qa', label: 'QA' },
  { key: 'seo', label: 'SEO' },
  { key: 'growth', label: 'Growth' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'engineering', label: 'Engineering' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'settings', label: 'Settings' },
] as const;
