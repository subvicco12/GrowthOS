import { cookies } from 'next/headers';
import { assertWebsiteAdminAccess, type WebsiteAdminAction } from '../core/admin-website-access';
import { verifyMySQLSession } from './mysql-session';
import { findMySQLMembership } from './mysql-membership';

export const SESSION_COOKIE_NAME = 'growthos_session';

/** Organization is a requested resource scope, never an identity claim. */
export async function requireWebsiteAccess(organizationId: string, action: WebsiteAdminAction) {
  if (!organizationId) throw new Error('UNAUTHORIZED_ORGANIZATION');
  const cookieStore = await cookies();
  const userId = await verifyMySQLSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) throw new Error('UNAUTHENTICATED');
  const membership = await findMySQLMembership(userId, organizationId);
  assertWebsiteAdminAccess(membership, organizationId, action);
  return { userId, organizationId, role: membership!.role };
}
