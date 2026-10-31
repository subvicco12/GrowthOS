import { getAuthenticatedOrganizationContext } from '../../../server/organization-context';
import { getMySQLPool } from '../../../server/mysql';
import { MySQLIsolatedOperations } from '../../../server/mysql-isolated-operations';
import { createOperationsHandlers } from '../../../server/isolated-operations-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handlers=createOperationsHandlers(getAuthenticatedOrganizationContext,()=>new MySQLIsolatedOperations(getMySQLPool(),{read:async()=>{throw Error('NO_NETWORK_ADAPTER');}}));
export const GET=handlers.GET;
export const POST=handlers.POST;
