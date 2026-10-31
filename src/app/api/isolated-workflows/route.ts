import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { MySQLIsolatedWorkflows } from '../../../server/mysql-isolated-workflows';
import { createOwnershipTransport } from '../../../server/bounded-ownership-fetch';
import { createIsolatedWorkflowHandlers } from '../../../server/isolated-workflows-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = createIsolatedWorkflowHandlers(getAuthenticatedOrganizationContext, () => new MySQLIsolatedWorkflows(getMySQLPool(),
  createOwnershipTransport((process.env.GROWTHOS_OWNERSHIP_ALLOWED_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean))));
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
