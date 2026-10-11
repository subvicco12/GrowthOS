import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from './mysql';
import type { AuthenticatedMembership, GrowthRole } from '../core/admin-website-access';

type MembershipRow = RowDataPacket & { user_id: string; organization_id: string; role: GrowthRole; disabled: number };

/** userId MUST come from a verified server session, never from a request body. */
export async function findMySQLMembership(userId: string, organizationId: string): Promise<AuthenticatedMembership | null> {
  if (!userId || !organizationId) return null;
  const [rows] = await getMySQLPool().execute<MembershipRow[]>(
    'SELECT m.user_id, m.organization_id, m.role, u.disabled FROM growth_memberships m JOIN growth_users u ON u.id = m.user_id WHERE m.user_id = ? AND m.organization_id = ? LIMIT 1',
    [userId, organizationId]);
  if (!rows.length) return null;
  return {
    userId: rows[0].user_id,
    organizationId: rows[0].organization_id,
    role: rows[0].role,
    active: !Boolean(rows[0].disabled)
  };
}
