export interface WordPressGrowthOSClientConfig {
  baseUrl: string;
  username: string;
  applicationPassword: string;
  timeoutMs?: number;
}

export interface GrowthOSClient {
  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T>;
  health(): Promise<{ ok: boolean; version: string; host: string }>;
  sites(): Promise<{ sites: Array<{ id: string; name: string; domain: string; status: string }> }>;
  dashboard(siteId?: string): Promise<unknown>;
  healthScore(siteId: string): Promise<unknown>;
  discoveries(siteId: string): Promise<unknown>;
  recommendations(siteId?: string): Promise<unknown>;
  features(siteId: string): Promise<unknown>;
  competitors(siteId: string): Promise<unknown>;
  competitorPackages(competitorId: string): Promise<unknown>;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('WORDPRESS_CONNECTOR_HTTPS_REQUIRED');
  return url.toString().replace(/\/$/, '');
}

function encodeBasicAuth(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
}

function buildQuery(query: Record<string, string | number | undefined> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export function createWordPressGrowthOSClient(config: WordPressGrowthOSClientConfig): GrowthOSClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (!config.username.trim() || !config.applicationPassword.trim()) {
    throw new Error('WORDPRESS_CONNECTOR_CREDENTIALS_REQUIRED');
  }
  const timeoutMs = Math.min(30_000, Math.max(2_000, config.timeoutMs ?? 10_000));
  const authorization = `Basic ${encodeBasicAuth(config.username, config.applicationPassword)}`;

  async function get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    if (!path.startsWith('/')) throw new Error('WORDPRESS_CONNECTOR_PATH_INVALID');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}${buildQuery(query)}`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization,
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      const text = await response.text();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (!response.ok) {
        const detail = typeof body === 'object' && body !== null && 'code' in body
          ? String((body as { code: unknown }).code)
          : `HTTP_${response.status}`;
        throw new Error(`WORDPRESS_CONNECTOR_${detail}`);
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get,
    health: () => get('/wp-json/growthos/v1/health'),
    sites: () => get('/wp-json/growthos/v1/sites'),
    dashboard: (siteId) => get('/wp-json/growthos/v1/dashboard', { site_id: siteId }),
    healthScore: (siteId) => get('/wp-json/growthos/v1/health-score', { site_id: siteId }),
    discoveries: (siteId) => get('/wp-json/growthos/v1/discoveries', { site_id: siteId }),
    recommendations: (siteId) => get('/wp-json/growthos/v1/recommendations', { site_id: siteId }),
    features: (siteId) => get('/wp-json/growthos/v1/features', { site_id: siteId }),
    competitors: (siteId) => get('/wp-json/growthos/v1/competitors', { site_id: siteId }),
    competitorPackages: (competitorId) => get('/wp-json/growthos/v1/competitor-packages', { competitor_id: competitorId }),
  };
}
