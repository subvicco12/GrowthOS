import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from './mysql';
import type { WebsiteBudgetRow } from '../app/website-budget-panel';

type BudgetRow = RowDataPacket & {
  websiteId: string; domain: string; status: string; verified: number;
  enabledContentTypes: string | number; weeklyUnits: string | number;
  configuredMonthlyMinor: string | number;
};

/** Caller must first verify session and organization membership. */
export async function listMySQLWebsiteBudgets(organizationId: string): Promise<WebsiteBudgetRow[]> {
  if (!organizationId) throw new Error('INVALID_SCOPE');
  const [rows] = await getMySQLPool().execute<BudgetRow[]>(`
    SELECT w.id AS websiteId, w.domain, w.status,
           (w.verified_at IS NOT NULL) AS verified,
           COUNT(p.website_id) AS enabledContentTypes,
           COALESCE(SUM(p.weekly_limit),0) AS weeklyUnits,
           COALESCE(SUM(p.monthly_budget_minor),0) AS configuredMonthlyMinor
    FROM growth_websites w
    LEFT JOIN growth_content_policies p
      ON p.organization_id = w.organization_id AND p.website_id = w.id AND p.enabled = TRUE
    WHERE w.organization_id = ?
    GROUP BY w.id,w.domain,w.status,w.verified_at
    ORDER BY w.domain ASC
  `, [organizationId]);
  return rows.map(row => ({
    websiteId: row.websiteId, domain: row.domain, status: row.status,
    verified: Boolean(row.verified),
    enabledContentTypes: Number(row.enabledContentTypes),
    weeklyUnits: Number(row.weeklyUnits),
    configuredMonthlyMinor: Number(row.configuredMonthlyMinor)
  }));
}
