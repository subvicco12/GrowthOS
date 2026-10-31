import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { createMySQLWebsiteSettingsStore } from '../../../server/mysql-website-settings';
import { createWebsiteSettingsHandlers } from '../../../server/website-settings-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = createWebsiteSettingsHandlers(getAuthenticatedOrganizationContext, () => createMySQLWebsiteSettingsStore(getMySQLPool()));
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
