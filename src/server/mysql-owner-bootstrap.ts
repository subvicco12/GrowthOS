import { randomUUID } from 'node:crypto';
import { getMySQLPool } from './mysql';
import { hashPassword } from './password-hashing';

/**
 * Trusted CLI/maintenance entry point ONLY. Never expose as an HTTP route.
 * Requires an empty installation and an operator-approved initial owner.
 * No signup, billing or automation is enabled.
 */
export async function bootstrapInitialOwner(input: {
  organizationName: string; ownerEmail: string; ownerPassword: string;
}): Promise<{ organizationId: string; userId: string }> {
  const name = input.organizationName.trim();
  const email = input.ownerEmail.trim().toLowerCase();
  if (!name || name.length > 200 || !email.includes('@') || email.length > 320) {
    throw new Error('INVALID_BOOTSTRAP_INPUT');
  }
  const hash = await hashPassword(input.ownerPassword);
  const connection = await getMySQLPool().getConnection();
  const organizationId = randomUUID();
  const userId = randomUUID();
  try {
    await connection.beginTransaction();
    // Serialize concurrent bootstrap attempts through a dedicated singleton row.
    const [rows] = await connection.execute<import('mysql2/promise').RowDataPacket[]>(
      'SELECT installed FROM growth_installation_state WHERE singleton_id=1 FOR UPDATE');
    if (!rows.length || rows[0].installed) throw new Error('ALREADY_BOOTSTRAPPED');
    await connection.execute(
      'INSERT INTO growth_organizations (id,name) VALUES (?,?)', [organizationId,name]);
    await connection.execute(
      'INSERT INTO growth_users (id,email,password_hash,disabled) VALUES (?,?,?,FALSE)',
      [userId,email,hash]);
    await connection.execute(
      "INSERT INTO growth_memberships (organization_id,user_id,role) VALUES (?,?,'owner')",
      [organizationId,userId]);
    await connection.execute(
      'INSERT INTO growth_organization_budgets (organization_id) VALUES (?)',
      [organizationId]);
    await connection.execute(
      'UPDATE growth_installation_state SET installed=TRUE WHERE singleton_id=1');
    await connection.commit();
    return { organizationId,userId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
