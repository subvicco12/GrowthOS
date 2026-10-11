import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from './mysql';
import { verifyPassword } from './password-hashing';
import { issueMySQLSession } from './mysql-session';

type AccountRow = RowDataPacket & { id: string; password_hash: string; disabled: number };
type ThrottleRow = RowDataPacket & { failed_attempts: number; locked_until: Date | null };
const keyFor = (email: string) => createHash('sha256').update(email).digest('hex');

export async function loginWithPassword(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  if (email.length > 320 || !email.includes('@') || !password || password.length > 1024) {
    throw new Error('INVALID_CREDENTIALS');
  }
  const connection = await getMySQLPool().getConnection();
  const key = keyFor(email);
  let userId: string | null = null;
  try {
    await connection.beginTransaction();
    await connection.execute(
      'INSERT INTO growth_login_throttles (account_key) VALUES (?) ON DUPLICATE KEY UPDATE account_key=VALUES(account_key)',
      [key]);
    const [throttles] = await connection.execute<ThrottleRow[]>(
      'SELECT failed_attempts, locked_until FROM growth_login_throttles WHERE account_key=? FOR UPDATE', [key]);
    if (throttles[0].locked_until && new Date(throttles[0].locked_until).getTime() > Date.now()) {
      throw new Error('LOGIN_THROTTLED');
    }
    if (throttles[0].locked_until) {
      await connection.execute(
        'UPDATE growth_login_throttles SET failed_attempts=0,locked_until=NULL WHERE account_key=?',
        [key]);
      throttles[0].failed_attempts = 0;
    }
    const [users] = await connection.execute<AccountRow[]>(
      'SELECT id,password_hash,disabled FROM growth_users WHERE email=? LIMIT 1', [email]);
    const user = users[0];
    const valid = user && !user.disabled && await verifyPassword(password, user.password_hash);
    if (!valid) {
      const failures = Number(throttles[0].failed_attempts) + 1;
      await connection.execute(
        'UPDATE growth_login_throttles SET failed_attempts=?, locked_until=IF(? >= 5, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), NULL) WHERE account_key=?',
        [failures, failures, key]);
      await connection.commit();
      throw new Error('INVALID_CREDENTIALS');
    }
    await connection.execute(
      'UPDATE growth_login_throttles SET failed_attempts=0,locked_until=NULL WHERE account_key=?', [key]);
    userId = user.id;
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch { /* transaction may already be committed */ }
    throw error;
  } finally {
    connection.release();
  }
  return issueMySQLSession(userId!);
}
