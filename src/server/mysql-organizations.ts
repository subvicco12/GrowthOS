import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from './mysql';
import type { GrowthRole } from '../core/admin-website-access';

export type OrganizationChoice = { id: string; name: string; role: GrowthRole };
type OrganizationRow = RowDataPacket & { id: string; name: string; role: GrowthRole };

/** Identity is supplied only by a verified server-side session. Never accept userId from the browser. */
export async function listAccessibleOrganizations(userId: string): Promise<OrganizationChoice[]> {
  if (!userId) return [];
  const [rows] = await getMySQLPool().execute<OrganizationRow[]>(
    'SELECT o.id,o.name,m.role FROM growth_memberships m JOIN growth_organizations o ON o.id=m.organization_id JOIN growth_users u ON u.id=m.user_id WHERE m.user_id=? AND u.disabled=FALSE ORDER BY o.name,o.id',
    [userId]
  );
  return rows.map(row => ({ id: row.id, name: row.name, role: row.role }));
}

/** Fail closed: no implicit first-organization fallback. */
export async function requireOrganizationChoice(userId: string, organizationId: string): Promise<OrganizationChoice> {
  if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');
  const choices = await listAccessibleOrganizations(userId);
  const selected = choices.find(choice => choice.id === organizationId);
  if (!selected) throw new Error('ORGANIZATION_FORBIDDEN');
  return selected;
}
