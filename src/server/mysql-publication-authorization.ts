import type { ConnectorCheckpointVerifier } from './connector-trust';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { ContentRecord } from '../core/content-lifecycle';
import type { PublicationClaim } from '../core/publication-handoff';
import { assertPublicationAuthorization, publicationAuthorizationRequestSchema, publicationAuthorizationSchema, contentAuthorizationHash, type PublicationAuthorization, type PublicationPolicySnapshot, type PublicationDestination } from '../core/publication-authorization';
import { decodeStoredContent } from './mysql-content-store';
import {decodeFactoryEnvelope} from './mysql-content-factory-store';
import { ConnectorEvidenceVerifier, type SignedConnectorAttestation } from './connector-evidence';

type Row = RowDataPacket & Record<string, unknown>;
const json = (value: unknown): unknown => typeof value === 'string' ? JSON.parse(value) : value;
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
export interface PublicationExecutionGuard {
  check(connection:PoolConnection,authorization:PublicationAuthorization,now:number):Promise<void>;
}
export interface PublicationAuthorizationReceipt {
  authorization: PublicationAuthorization; requestorId: string; connectorHash: string; checkedAt: number; expiresAt: number; recheck: (at?:number) => Promise<void>;
}
/** No pool, environment, provider or key defaults. Uses the caller's existing locked transaction. */
export class MySQLPublicationAuthorization {
  constructor(private readonly connectorVerifier = new ConnectorEvidenceVerifier(), private readonly checkpoint?: ConnectorCheckpointVerifier, private readonly executionGuard?:PublicationExecutionGuard) {}
  async authorize(connection: PoolConnection, claim: PublicationClaim, record: ContentRecord,
    switches: Omit<PublicationPolicySnapshot,'revision'|'featureEnabled'>, now: number): Promise<PublicationAuthorizationReceipt> {
    return this.check(connection,claim,record,switches,now);
  }
  async inspectForIssuance(connection: PoolConnection, claim: PublicationClaim, record: ContentRecord, switches: Omit<PublicationPolicySnapshot,'revision'|'featureEnabled'>, now: number, candidate: PublicationAuthorization): Promise<PublicationAuthorizationReceipt> {
    return this.check(connection,claim,record,switches,now,candidate);
  }
  private async check(connection: PoolConnection, claim: PublicationClaim, record: ContentRecord, switches: Omit<PublicationPolicySnapshot,'revision'|'featureEnabled'>, now: number, candidate?: PublicationAuthorization): Promise<PublicationAuthorizationReceipt> {
    if(Object.hasOwn(record,'_factory'))throw Error('FACTORY_PUBLICATION_ATOMIC_ADAPTER_REQUIRED');
    const request = publicationAuthorizationRequestSchema.parse(claim.authorization);
    const [sessions] = await connection.execute<Row[]>(
      'SELECT s.user_id,s.expires_at,s.revoked_at,u.disabled FROM growth_sessions s JOIN growth_users u ON u.id=s.user_id WHERE s.token_hash=? FOR UPDATE', [request.sessionTokenHash]);
    if (sessions.length !== 1 || Number(sessions[0].disabled) !== 0 || sessions[0].revoked_at !== null || !Number.isFinite(Date.parse(iso(sessions[0].expires_at))) || Date.parse(iso(sessions[0].expires_at)) <= now) throw Error('PUBLICATION_SESSION_DENIED');
    const [authorizations] = candidate ? [[{authorization_json:candidate,revoked_at:null,consumed_at:null}]] : await connection.execute<Row[]>(
      'SELECT authorization_json,revoked_at,consumed_at FROM growth_content_authorizations WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
      [claim.organizationId,claim.websiteId,request.authorizationId]);
    if (authorizations.length !== 1 || authorizations[0].revoked_at !== null || authorizations[0].consumed_at !== null) throw Error('PUBLICATION_APPROVAL_MISSING_REVOKED_OR_USED');
    // Parse before using an approver identifier in the membership query.
    const authorization = publicationAuthorizationSchema.parse(json(authorizations[0].authorization_json));
    const [decisions] = await connection.execute<Row[]>(
      "SELECT event_id,actor_id,occurred_at,version,record_json FROM growth_content_events WHERE organization_id=? AND website_id=? AND content_id=? AND event_id=? AND event_kind='approve' FOR UPDATE",
      [claim.organizationId,claim.websiteId,claim.contentId,authorization.approvalDecisionId]);
    if (decisions.length !== 1) throw Error('CONTENT_APPROVAL_EVENT_REQUIRED');
    const decision = decisions[0];
    const approvedStored = decodeStoredContent(decision as Row & {record_json:string;version:number},claim.organizationId,claim.websiteId,claim.contentId);
    const approvedRecord = Object.hasOwn(approvedStored,'_factory')
      ? decodeFactoryEnvelope(decision,{organizationId:claim.organizationId,websiteId:claim.websiteId,contentId:claim.contentId}).record
      : approvedStored;
    if (decision.event_id !== authorization.approvalDecisionId || decision.actor_id !== authorization.approverId ||
        Date.parse(iso(decision.occurred_at)) !== Date.parse(authorization.approvedAt) || approvedRecord.stage !== 'approved' || approvedRecord.version !== record.version-1 ||
        approvedRecord.eventIds.at(-1) !== authorization.approvalDecisionId || record.eventIds.at(-2) !== authorization.approvalDecisionId ||
        contentAuthorizationHash({...approvedRecord,version:record.version,stage:record.stage,eventIds:record.eventIds,schedule:record.schedule}) !== contentAuthorizationHash(record)) throw Error('CONTENT_APPROVAL_EVENT_MISMATCH');
    const requestorId = String(sessions[0].user_id);
    const [members] = await connection.execute<Row[]>(
      'SELECT m.user_id,m.role,u.disabled FROM growth_memberships m JOIN growth_users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id IN (?,?) ORDER BY m.user_id FOR UPDATE',
      [claim.organizationId,requestorId,authorization.approverId]);
    const member = (userId: string) => {
      const matches = members.filter(m => m.user_id === userId);
      if (matches.length !== 1) throw Error('PUBLICATION_MEMBERSHIP_DENIED');
      return { organizationId:claim.organizationId,userId,role:String(matches[0].role),disabled:Number(matches[0].disabled) !== 0 };
    };
    const [policies] = await connection.execute<Row[]>(
      'SELECT revision,feature_enabled FROM growth_publication_policy_revisions WHERE organization_id=? AND website_id=? AND content_type=? FOR UPDATE',
      [claim.organizationId,claim.websiteId,record.contentType]);
    if (policies.length !== 1 || typeof policies[0].revision !== 'string') throw Error('PUBLICATION_POLICY_UNAVAILABLE');
    const policy = { ...switches, revision:policies[0].revision,featureEnabled:Number(policies[0].feature_enabled) === 1 };
    const [destinations] = await connection.execute<Row[]>(
      'SELECT channel,revision,target,enabled FROM growth_publication_destinations WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
      [claim.organizationId,claim.websiteId,request.destinationId]);
    if (destinations.length !== 1) throw Error('PUBLICATION_DESTINATION_UNAVAILABLE');
    const d = destinations[0];
    const destination: PublicationDestination = { organizationId:claim.organizationId,websiteId:claim.websiteId,id:request.destinationId,channel:String(d.channel),revision:String(d.revision),target:String(d.target),enabled:Number(d.enabled) === 1 };
    const approved = assertPublicationAuthorization({ record,channel:claim.channel,reservationId:claim.reservationId,request,authorization,policy,requestor:member(requestorId),approver:member(authorization.approverId),destination,now });
    const [attestations] = await connection.execute<Row[]>(
      'SELECT signed_json,revoked_at FROM growth_connector_attestations WHERE organization_id=? AND website_id=? AND channel=? AND destination_id=? FOR UPDATE',
      [claim.organizationId,claim.websiteId,claim.channel,destination.id]);
    if (attestations.length !== 1 || attestations[0].revoked_at !== null) throw Error('CONNECTOR_ATTESTATION_UNAVAILABLE');
    const signed = json(attestations[0].signed_json) as SignedConnectorAttestation;
    if (!signed?.evidence || typeof signed.evidence.issuer !== 'string' || typeof signed.evidence.keyId !== 'string') throw Error('CONNECTOR_EVIDENCE_INVALID');
    const [trust] = await connection.execute<Row[]>(
      'SELECT revision,revoked FROM growth_connector_issuer_state WHERE issuer=? AND key_id=? FOR UPDATE', [signed.evidence.issuer,signed.evidence.keyId]);
    if (trust.length !== 1) throw Error('CONNECTOR_TRUST_UNAVAILABLE');
    const verified = this.connectorVerifier.verify(signed,destination,{ issuer:signed.evidence.issuer,keyId:signed.evidence.keyId,revision:String(trust[0].revision),revoked:Number(trust[0].revoked) !== 0 },now);
    if(!this.checkpoint)throw Error('CONNECTOR_CHECKPOINT_UNAVAILABLE');
    const trustSnapshot={issuer:signed.evidence.issuer,keyId:signed.evidence.keyId,revision:String(trust[0].revision),revoked:Number(trust[0].revoked)!==0};
    const recheck=async(at=now)=>{
      if(!Number.isFinite(at)||at<now)throw Error('PUBLICATION_AUTHORIZATION_EXPIRED');
      await this.checkpoint!.assertCurrent({signed,payloadHash:verified.payloadHash,trust:trustSnapshot});
      if(!this.executionGuard)throw Error('PUBLICATION_EXECUTION_GATE_UNAVAILABLE');
      await this.executionGuard.check(connection,approved,at);
    };
    await recheck();
    return { recheck, authorization:approved,requestorId,connectorHash:verified.payloadHash,checkedAt:now,expiresAt:Math.min(Date.parse(iso(sessions[0].expires_at)),Date.parse(approved.expiresAt),Date.parse(verified.evidence.expiresAt)) };
  }
  async consume(connection: PoolConnection, receipt: PublicationAuthorizationReceipt, claimHash: string, now: number): Promise<void> {
    if (!Number.isFinite(now) || now < receipt.checkedAt || now >= receipt.expiresAt) throw Error('PUBLICATION_AUTHORIZATION_EXPIRED');
    await receipt.recheck(now);
    const a = receipt.authorization;
    const [updated] = await connection.execute<ResultSetHeader>(
      'UPDATE growth_content_authorizations SET consumed_at=?,claim_hash=? WHERE organization_id=? AND website_id=? AND id=? AND consumed_at IS NULL AND revoked_at IS NULL',
      [new Date(now),claimHash,a.organizationId,a.websiteId,a.id]);
    if (updated.affectedRows !== 1) throw Error('PUBLICATION_AUTHORIZATION_REPLAY');
    const [inserted] = await connection.execute<ResultSetHeader>(
      'INSERT INTO growth_publication_authorization_uses (organization_id,website_id,authorization_id,approval_decision_id,claim_hash,actor_id,content_version,destination_id,policy_hash,connector_hash,content_id,used_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [a.organizationId,a.websiteId,a.id,a.approvalDecisionId,claimHash,receipt.requestorId,a.contentVersion,a.destinationId,a.policyHash,receipt.connectorHash,a.contentId,new Date(now)]);
    if (inserted.affectedRows !== 1) throw Error('PUBLICATION_AUTHORIZATION_AUDIT_FAILED');
  }
}
