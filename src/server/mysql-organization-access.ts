import type { RowDataPacket } from 'mysql2/promise';
import { cookies } from 'next/headers';
import { getMySQLPool } from './mysql';
import { SESSION_COOKIE_NAME } from './authenticated-website-access';
import { verifyMySQLSession } from './mysql-session';

type OrgRow = RowDataPacket & { organization_id: string };

/** Never select an organization from an unverified browser identity. */
export async function getAuthenticatedOrganization(): Promise<string | null> {
  const store = await cookies();
  const userId = await verifyMySQLSession(store.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return null;
  const [rows] = await getMySQLPool().execute<OrgRow[]>(
    'SELECT organization_id FROM growth_memberships WHERE user_id = ? ORDER BY organization_id LIMIT 1',
    [userId]);
  return rows[0]?.organization_id ?? null;
}
