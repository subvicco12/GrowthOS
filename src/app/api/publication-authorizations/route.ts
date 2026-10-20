import { authorizationHttpHandler } from '../../../server/authorization-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// No production persistence/anchor/issuer has been provisioned or certified.
export const POST=authorizationHttpHandler(null);
