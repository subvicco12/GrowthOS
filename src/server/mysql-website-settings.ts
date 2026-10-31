import { createHash, randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { assertWebsiteSettingsChange, type WebsiteSettings, type WebsiteSettingsPatch, type ShutdownEvent } from '../core/website-settings';

type SiteRow = RowDataPacket & { id: string; domain: string; platform: string; status: string; timezone: string;
  verified_at: Date | string | null; automation_enabled: unknown; auto_publish_enabled: unknown; monthly_budget_minor: string };
const fields = 'id,domain,platform,status,timezone,verified_at,automation_enabled,auto_publish_enabled,monthly_budget_minor';
const enabled = (v: unknown) => v === true || v === 1 || v === '1';
function project(row: SiteRow, organizationId: string): WebsiteSettings {
  const site = { id: row.id, domain: row.domain, platform: row.platform, status: row.status, timezone: row.timezone,
    verifiedAt: row.verified_at === null ? null : new Date(row.verified_at).toISOString(),
    automationEnabled: enabled(row.automation_enabled), autoPublishEnabled: enabled(row.auto_publish_enabled),
    monthlyBudgetMinor: String(row.monthly_budget_minor) };
  // A content snapshot, not an authorization token or a monotonic database revision.
  return { ...site, stateToken: createHash('sha256').update(JSON.stringify([organizationId, site])).digest('hex') };
}
export type ShutdownPosition = { at: string; id: string };
export interface WebsiteSettingsStore {
  read(organizationId: string, websiteId: string): Promise<WebsiteSettings>;
  update(organizationId: string, actorId: string, patch: WebsiteSettingsPatch): Promise<WebsiteSettings>;
  history(organizationId: string, websiteId: string, cursor: ShutdownPosition | null): Promise<{ items: ShutdownEvent[]; next: ShutdownPosition | null }>;
}

/** The HTTP boundary authenticates membership; every query also binds the website to that organization. */
export function createMySQLWebsiteSettingsStore(pool: Pick<Pool, 'execute' | 'getConnection'>): WebsiteSettingsStore {
  return {
    async read(organizationId, websiteId) {
      const [rows] = await pool.execute<SiteRow[]>(`SELECT ${fields} FROM growth_websites WHERE organization_id=? AND id=?`, [organizationId, websiteId]);
      if (!rows.length) throw Error('WEBSITE_NOT_FOUND');
      return project(rows[0], organizationId);
    },
    async update(organizationId, actorId, patch) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute<SiteRow[]>(`SELECT ${fields} FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE`, [organizationId, patch.websiteId]);
        if (!rows.length) throw Error('WEBSITE_NOT_FOUND');
        const before = project(rows[0], organizationId);
        if (before.stateToken !== patch.expectedState) throw Error('SETTINGS_CONFLICT');
        assertWebsiteSettingsChange(before, patch);
        if (patch.action === 'metadata') {
          await connection.execute('UPDATE growth_websites SET platform=?,timezone=? WHERE organization_id=? AND id=?',
            [patch.platform, patch.timezone, organizationId, patch.websiteId]);
        } else {
          // Stop controls and their existing append-only shutdown events commit together.
          await connection.execute('UPDATE growth_websites SET status=?,automation_enabled=FALSE,auto_publish_enabled=FALSE WHERE organization_id=? AND id=?',
            [patch.status, organizationId, patch.websiteId]);
          for (const feature of ['automation', 'auto_publish'] as const) {
            if (feature === 'automation' ? before.automationEnabled : before.autoPublishEnabled)
              await connection.execute('INSERT INTO growth_website_feature_audit (id,organization_id,website_id,actor_id,feature,enabled) VALUES (?,?,?,?,?,FALSE)',
                [randomUUID(), organizationId, patch.websiteId, actorId, feature]);
          }
        }
        const [updated] = await connection.execute<SiteRow[]>(`SELECT ${fields} FROM growth_websites WHERE organization_id=? AND id=?`, [organizationId, patch.websiteId]);
        if (!updated.length) throw Error('WEBSITE_NOT_FOUND');
        const result = project(updated[0], organizationId);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    },
    async history(organizationId, websiteId, cursor) {
      type EventRow = RowDataPacket & { id: string; actor_id: string; feature: ShutdownEvent['feature']; at: string };
      const [rows] = await pool.execute<EventRow[]>(
        "SELECT id,actor_id,feature,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS at FROM growth_website_feature_audit WHERE organization_id=? AND website_id=?" +
        (cursor ? ' AND (created_at<? OR (created_at=? AND id<?))' : '') + ' ORDER BY created_at DESC,id DESC LIMIT 26',
        cursor ? [organizationId, websiteId, cursor.at, cursor.at, cursor.id] : [organizationId, websiteId]);
      const page = rows.slice(0, 25), last = page.at(-1);
      return { items: page.map(row => ({ id: row.id, actorId: row.actor_id, feature: row.feature, createdAt: row.at.replace(' ', 'T') + 'Z' })),
        next: rows.length > 25 && last ? { at: last.at, id: last.id } : null };
    }
  };
}
