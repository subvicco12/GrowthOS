import { verifyMySQLSession } from './mysql-session';
import { listAccessibleOrganizations, requireOrganizationChoice } from './mysql-organizations';
import { SESSION_COOKIE_NAME } from './authenticated-website-access';

export const ORGANIZATION_COOKIE_NAME = 'growthos_organization';

/** Read cookies from the actual request, not caller-supplied identity headers. */
function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get('cookie') || '';
  for (const item of cookie.split(';')) {
    const idx = item.indexOf('=');
    if (idx < 0 || item.slice(0, idx).trim() !== name) continue;
    try { return decodeURIComponent(item.slice(idx + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}

export async function getAuthenticatedOrganizationContext(request: Request) {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  const userId = await verifyMySQLSession(token);
  if (!userId) throw new Error('AUTHENTICATION_REQUIRED');
  const organizationId = readCookie(request, ORGANIZATION_COOKIE_NAME);
  if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');
  const organization = await requireOrganizationChoice(userId, organizationId);
  return { userId, organization };
}

export async function getAuthenticatedOrganizationChoices(request: Request) {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  const userId = await verifyMySQLSession(token);
  if (!userId) throw new Error('AUTHENTICATION_REQUIRED');
  return { userId, organizations: await listAccessibleOrganizations(userId) };
}
