import {getAuthenticatedOrganizationContext} from '../../../server/organization-context';
import {getMySQLPool} from '../../../server/mysql';
import {Session04Portfolio} from '../../../server/session04-portfolio';
import {createSession04Handlers} from '../../../server/session04-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
const handlers=createSession04Handlers(getAuthenticatedOrganizationContext,()=>new Session04Portfolio(getMySQLPool()));
export const GET=handlers.GET;export const POST=handlers.POST;
