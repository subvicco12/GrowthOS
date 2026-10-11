import { WebsiteBudgetPanel } from '../../website-budget-panel';

export const metadata = { title: 'Website AI Budgets | GrowthOS' };

/**
 * Deliberately empty until the authenticated server-side registry repository is wired.
 * Never use sample budgets or client-provided organization IDs as production data.
 */
export default function WebsiteBudgetsPage() {
  return <main>
    <WebsiteBudgetPanel rows={[]} />
    <p style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 24px' }}>
      Registry connection pending. No website data is displayed until authenticated
      organization-scoped reads are available.
    </p>
  </main>;
}
