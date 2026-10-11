import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from './mysql';
import { normalizeDomain, type WebsitePlatform } from '../core/website-registry';

type Row = RowDataPacket & Record<string, unknown>;
const platforms: readonly string[] = ['wordpress','nextjs','react','static','custom'];

/** Requires a previously authenticated and authorized organization member. */
export async function listMySQLWebsites(organizationId: string) {
  if (!organizationId) throw new Error('INVALID_SCOPE');
  const [rows] = await getMySQLPool().execute<Row[]>(
    'SELECT id, domain, platform, status, timezone, verified_at, automation_enabled, auto_publish_enabled FROM growth_websites WHERE organization_id = ? ORDER BY created_at DESC',
    [organizationId]);
  return rows.map(row => ({
    id: String(row.id), domain: String(row.domain), platform: String(row.platform),
    status: String(row.status), timezone: String(row.timezone),
    verified: row.verified_at !== null,
    automationEnabled: Boolean(row.automation_enabled),
    autoPublishEnabled: Boolean(row.auto_publish_enabled)
  }));
}

/** Never activates, verifies or enables automation during registration. */
export async function registerMySQLWebsite(input: {
  organizationId: string; domain: string; platform: WebsitePlatform; timezone: string;
}): Promise<string> {
  if (!input.organizationId || !platforms.includes(input.platform)) throw new Error('INVALID_SCOPE');
  const domain = normalizeDomain(input.domain);
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); }
  catch { throw new Error('INVALID_TIMEZONE'); }
  const id = randomUUID();
  await getMySQLPool().execute(
    'INSERT INTO growth_websites (id,organization_id,domain,platform,timezone) VALUES (?,?,?,?,?)',
    [id,input.organizationId,domain,input.platform,input.timezone]);
  return id;
}
