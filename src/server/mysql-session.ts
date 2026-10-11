import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from './mysql';

type SessionRow = RowDataPacket & { user_id: string; disabled: number };
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

/** Session creation is allowed only after password verification and login rate-limit checks. */
export async function issueMySQLSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  if (!userId) throw new Error('INVALID_USER');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await getMySQLPool().execute(
    'INSERT INTO growth_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)',
    [randomUUID(),userId,digest(token),expiresAt]);
  return { token, expiresAt };
}

/** Read token exclusively from an HttpOnly Secure SameSite cookie on the server. */
export async function verifyMySQLSession(token: string | undefined): Promise<string | null> {
  if (!token || token.length > 256) return null;
  const [rows] = await getMySQLPool().execute<SessionRow[]>(
    'SELECT s.user_id,u.disabled FROM growth_sessions s JOIN growth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP() LIMIT 1',
    [digest(token)]);
  return rows.length && !rows[0].disabled ? rows[0].user_id : null;
}

export async function revokeMySQLSession(token: string): Promise<void> {
  if (!token || token.length > 256) return;
  await getMySQLPool().execute(
    'UPDATE growth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE token_hash=?',
    [digest(token)]);
}
