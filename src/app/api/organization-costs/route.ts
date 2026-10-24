import type { RowDataPacket } from 'mysql2/promise';
import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { pageError } from '../../../server/organization-pagination';
import { projectRecordedCosts } from '../../../server/mysql-cost-projection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Row = RowDataPacket & { website_id: string; recorded_minor: string; completed_count: string | number };

/** Ledger entries are recorded completed costs, not provider invoices or a currency claim. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { organization } = await getAuthenticatedOrganizationContext(request);
    const monthStart = new Date().toISOString().slice(0, 7) + '-01';
    const [rows] = await getMySQLPool().execute<Row[]>(
      'SELECT website_id,CAST(SUM(actual_cost_minor) AS CHAR) AS recorded_minor,COUNT(*) AS completed_count FROM growth_ai_reservations ' +
      'WHERE organization_id=? AND month_start=? AND status=? AND actual_cost_minor IS NOT NULL GROUP BY website_id',
      [organization.id, monthStart, 'completed']
    );
    return Response.json({ ok: true, organizationId: organization.id, monthStart, currency: null, providerBilledSpendAvailable: false,
      accountingBasis: 'recorded_completed_reservations', reservationEstimatesIncluded: false, cancelledReservationCostsIncluded: false, settlementStatus: 'unverified',
      recordedCompletedCosts: projectRecordedCosts(rows) },
    { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return pageError(error); }
}
