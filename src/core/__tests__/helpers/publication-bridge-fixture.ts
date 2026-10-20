import { createHmac } from 'node:crypto';
import type { ContentRecord } from '../../content-lifecycle';
import { contentAuthorizationHash, publicationPolicyHash, type PublicationAuthorization, type PublicationPolicySnapshot } from '../../publication-authorization';
import { connectorEvidencePayload, ConnectorEvidenceVerifier, type ConnectorAttestation } from '../../../server/connector-evidence';
import { MySQLPublicationAuthorization } from '../../../server/mysql-publication-authorization';
/** Synthetic only. No environment, real keys or network. */
export function publicationBridgeFixture(record: ContentRecord, now: number) {
  const destination = { organizationId:record.organizationId,websiteId:record.websiteId,channel:record.schedule!.channel,id:'destination1',revision:'destination_revision1',target:'https://example.test/account',enabled:true };
  const policy: PublicationPolicySnapshot = { revision:'policy_revision1',globalPaused:false,siteActive:true,websiteVerified:true,automationEnabled:true,publishingEnabled:true,featureEnabled:true,contentPublishingEnabled:true };
  const request = { authorizationId:'authorization1',sessionTokenHash:'a'.repeat(64),contentVersion:record.version,destinationId:destination.id };
  const authorization: PublicationAuthorization = {
    schemaVersion:1,id:request.authorizationId,organizationId:record.organizationId,websiteId:record.websiteId,contentId:record.id,contentVersion:record.version,contentHash:contentAuthorizationHash(record),
    channel:destination.channel,destinationId:destination.id,destinationRevision:destination.revision,destinationTarget:destination.target,reservationId:'reservation1',
    approvalDecisionId:record.eventIds.at(-2)!,decision:'approved',purpose:'content_publication',approverId:record.approval!.actorId,approvedAt:record.approval!.at,
    issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString(),policyHash:publicationPolicyHash(record,policy)
  };
  const issuer = { id:'synthetic_connector',keyId:'key1',secret:Buffer.alloc(32,29),revoked:false,trustRevision:'trust_revision1',organizationId:record.organizationId,websiteId:record.websiteId,channel:destination.channel,destinationId:destination.id,destinationRevision:destination.revision,destinationTarget:destination.target };
  const evidence: ConnectorAttestation = { issuer:issuer.id,keyId:issuer.keyId,eventId:'probe1',trustRevision:issuer.trustRevision,organizationId:record.organizationId,websiteId:record.websiteId,channel:destination.channel,destinationId:destination.id,destinationRevision:destination.revision,destinationTarget:destination.target,status:'verified',capabilities:['publish'],checkedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString() };
  const signed = { evidence,signature:createHmac('sha256',issuer.secret).update(connectorEvidencePayload(evidence)).digest('hex') };
  return { request,authorization,destination,policy,issuer,signed,boundary:new MySQLPublicationAuthorization(new ConnectorEvidenceVerifier([issuer]),{assertCurrent:async()=>{ /* Synthetic checkpoint, not durable anti-rollback certification. */ }},{check:async()=>{ /* Synthetic limits, never a production quota adapter. */ }}) };
}
