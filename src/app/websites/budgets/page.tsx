import { WebsiteBudgetPanel } from '../../website-budget-panel';
import { getAuthenticatedOrganization } from '../../../server/mysql-organization-access';
import { listMySQLWebsiteBudgets } from '../../../server/mysql-budget-overview';

export const metadata = { title: 'Website AI Budgets | GrowthOS' };
export const dynamic = 'force-dynamic';

/** Fail closed: never show placeholder records or another tenant's budgets. */
export default async function WebsiteBudgetsPage() {
  try {
    const organizationId = await getAuthenticatedOrganization();
    if (!organizationId) return <main><h1>Website AI budgets</h1><p>Sign in with an authorized organization account to view website budgets.</p></main>;
    const rows = await listMySQLWebsiteBudgets(organizationId);
    return <main><WebsiteBudgetPanel rows={rows} /></main>;
  } catch {
    return <main><h1>Website AI budgets</h1><p>Budget data is temporarily unavailable. No changes have been made.</p></main>;
  }
}
