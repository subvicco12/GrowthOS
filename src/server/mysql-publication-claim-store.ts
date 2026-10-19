import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getMySQLPool } from './mysql';
import type { PublicationClaim, PublicationClaimStore } from '../core/publication-handoff';
import { transitionContent, type ContentRecord, type ContentEvent } from '../core/content-lifecycle';
import { projectConnectorHealth, type ConnectorHealthEvidence } from '../core/connector-health';
import { decodeStoredContent, writeContentTransition } from './mysql-content-store';
import { exactUnsigned } from './mysql-integer';
import { MySQLPublicationAuthorization } from './mysql-publication-authorization';
import { PublicationEvidenceVerifier, publicationClaimHash, type SignedPublicationObservation } from './publication-evidence';

type Row = RowDataPacket & Record<string, unknown>;
const id = (value: string) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
function validateClaim(claim: PublicationClaim): void {
  if (![claim.organizationId,claim.websiteId,claim.contentId,claim.reservationId].every(id) ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(claim.channel) || claim.idempotencyKey.length > 512 ||
      claim.idempotencyKey !== `publish:${claim.organizationId}:${claim.websiteId}:${claim.contentId}:${claim.channel}`) throw Error('INVALID_PUBLICATION_CLAIM');
}
async function lockContent(connection: PoolConnection, claim: PublicationClaim): Promise<ContentRecord> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT version,record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
    [claim.organizationId,claim.websiteId,claim.contentId]);
  if (rows.length !== 1) throw Error('CONTENT_NOT_FOUND');
  return decodeStoredContent(rows[0] as RowDataPacket & { record_json: string; version: number },claim.organizationId,claim.websiteId,claim.contentId);
}
async function advance(connection: PoolConnection, current: ContentRecord, event: ContentEvent, userId: string): Promise<void> {
  const actor = { userId, organizationId:current.organizationId, websiteId:current.websiteId, role:'admin' as const, trustedProviderEvidence:true };
  const next = transitionContent(current,event,actor);
  await writeContentTransition(connection,current,next,{event,actor});
}

/** No provider calls. Missing proposed tables or missing explicit evidence trust fail closed. */
export class MySQLPublicationClaimStore implements PublicationClaimStore {
  constructor(private readonly pool: Pick<Pool, 'getConnection'> = getMySQLPool(),
    private readonly verifier: PublicationEvidenceVerifier = new PublicationEvidenceVerifier([]),
    private readonly clock: () => number = Date.now,
    private readonly authorization = new MySQLPublicationAuthorization()) {}
  async claimOnce(claim: PublicationClaim): Promise<boolean> {
    validateClaim(claim);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [budget] = await connection.execute<Row[]>(
        'SELECT globally_paused FROM growth_organization_budgets WHERE organization_id=? FOR UPDATE', [claim.organizationId]);
      if (budget.length !== 1 || Number(budget[0].globally_paused) !== 0) throw Error('PUBLISHING_DISABLED');
      const [site] = await connection.execute<Row[]>(
        'SELECT status,verified_at,automation_enabled,auto_publish_enabled FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE', [claim.organizationId,claim.websiteId]);
      if (site.length !== 1 || site[0].status !== 'active' || !site[0].verified_at || Number(site[0].auto_publish_enabled) !== 1 || Number(site[0].automation_enabled) !== 1) throw Error('PUBLISHING_DISABLED');
      const record = await lockContent(connection,claim);
      const [prior] = await connection.execute<Row[]>(
        'SELECT claim_hash FROM growth_publication_claims WHERE organization_id=? AND website_id=? AND content_id=? AND channel=? FOR UPDATE',
        [claim.organizationId,claim.websiteId,claim.contentId,claim.channel]);
      if (prior.length) { await connection.rollback(); return false; }
      const due = record.schedule && Date.parse(record.schedule.at);
      if (record.stage !== 'scheduled' || !record.approval?.actorId || !Number.isFinite(Date.parse(record.approval.at)) ||
          !record.quality || ![record.quality.factual,record.quality.original,record.quality.rightsCleared,record.quality.disclosureChecked].every(x => x === true) ||
          !record.schedule || record.schedule.channel !== claim.channel || typeof due !== 'number' || !Number.isFinite(due) || due > this.clock()) throw Error('PUBLICATION_NOT_APPROVED');
      const [policy] = await connection.execute<Row[]>(
        'SELECT enabled,auto_publish FROM growth_content_policies WHERE organization_id=? AND website_id=? AND content_type=? FOR UPDATE',
        [claim.organizationId,claim.websiteId,record.contentType]);
      if (policy.length !== 1 || Number(policy[0].enabled) !== 1 || Number(policy[0].auto_publish) !== 1) throw Error('PUBLISHING_DISABLED');
      const [connector] = await connection.execute<Row[]>(
        'SELECT organization_id,website_id,channel,checked_at,expires_at,status FROM growth_connector_health WHERE organization_id=? AND website_id=? AND channel=? FOR UPDATE',
        [claim.organizationId,claim.websiteId,claim.channel]);
      const health = connector.length === 1 ? {
        organizationId:String(connector[0].organization_id),websiteId:String(connector[0].website_id),channel:String(connector[0].channel),
        status:connector[0].status,checkedAt:connector[0].checked_at instanceof Date ? connector[0].checked_at.toISOString() : String(connector[0].checked_at),
        expiresAt:connector[0].expires_at instanceof Date ? connector[0].expires_at.toISOString() : String(connector[0].expires_at)
      } as ConnectorHealthEvidence : null;
      if (projectConnectorHealth(claim,health,this.clock()).state !== 'verified') throw Error('CONNECTOR_UNAVAILABLE');
      const [reservation] = await connection.execute<Row[]>(
        'SELECT status,content_type,actual_cost_minor FROM growth_ai_reservations WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
        [claim.organizationId,claim.websiteId,claim.reservationId]);
      if (reservation.length !== 1 || reservation[0].status !== 'completed' || reservation[0].content_type !== record.contentType ||
          reservation[0].actual_cost_minor === null || reservation[0].actual_cost_minor === undefined) throw Error('APPROVAL_OR_RESERVATION_REQUIRED');
      exactUnsigned(reservation[0].actual_cost_minor);
      const receipt = await this.authorization.authorize(connection,claim,record,{
        globalPaused:Number(budget[0].globally_paused) !== 0,siteActive:site[0].status === 'active',websiteVerified:Boolean(site[0].verified_at),
        automationEnabled:Number(site[0].automation_enabled) === 1,publishingEnabled:Number(site[0].auto_publish_enabled) === 1,
        contentPublishingEnabled:Number(policy[0].enabled) === 1 && Number(policy[0].auto_publish) === 1
      },this.clock());
      try {
        const [result] = await connection.execute<ResultSetHeader>(
          'INSERT INTO growth_publication_claims (organization_id,website_id,content_id,channel,claim_hash,reservation_id,status) VALUES (?,?,?,?,?,?,?)',
          [claim.organizationId,claim.websiteId,claim.contentId,claim.channel,publicationClaimHash(claim),claim.reservationId,'unknown']);
        if (result.affectedRows !== 1) throw Error('CLAIM_INSERT_FAILED');
      } catch (error) {
        if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
        await connection.rollback(); return false;
      }
      await this.authorization.consume(connection,receipt,publicationClaimHash(claim),this.clock());
      // Commit the one-time claim and the ambiguous content status together, before any potential outbound work.
      await advance(connection,record,{kind:'publication_unknown',eventId:'claim_'+publicationClaimHash(claim),at:new Date(this.clock()).toISOString()},receipt.requestorId);
      await connection.commit(); return true;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  async reconcile(claim: PublicationClaim, input: SignedPublicationObservation): Promise<'confirmed' | 'absent' | 'unknown'> {
    validateClaim(claim);
    const { observation:o,payloadHash } = this.verifier.verify(input,claim,this.clock());
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      // Same content-before-claim order as claimOnce; content cancellation cannot race a claim.
      const record = await lockContent(connection,claim);
      const [rows] = await connection.execute<Row[]>(
        'SELECT status,provider_id,publication_url,reservation_id FROM growth_publication_claims WHERE organization_id=? AND website_id=? AND content_id=? AND channel=? AND claim_hash=? FOR UPDATE',
        [claim.organizationId,claim.websiteId,claim.contentId,claim.channel,publicationClaimHash(claim)]);
      if (rows.length !== 1 || rows[0].reservation_id !== claim.reservationId) throw Error('CLAIM_NOT_FOUND');
      const row = rows[0], target = o.result.kind === 'published' ? 'confirmed' : o.result.kind;
      const [seen] = await connection.execute<Row[]>(
        'SELECT payload_hash FROM growth_publication_observations WHERE organization_id=? AND issuer=? AND event_id=? FOR UPDATE', [claim.organizationId,o.issuer,o.eventId]);
      if (seen.length && seen[0].payload_hash !== payloadHash) throw Error('PUBLICATION_EVIDENCE_REPLAY');
      if (row.status !== 'unknown' && row.status !== target) throw Error('PUBLICATION_STATUS_CONFLICT');
      if (row.status === 'confirmed' && (o.result.kind !== 'published' || row.provider_id !== o.result.providerId || row.publication_url !== o.result.url)) throw Error('PUBLICATION_STATUS_CONFLICT');
      if (!['publication_unknown','published','attributed'].includes(record.stage) ||
          (row.status !== 'confirmed' && record.stage !== 'publication_unknown') ||
          (row.status === 'confirmed' && (!record.publication || record.publication.providerId !== row.provider_id || record.publication.url !== row.publication_url))) throw Error('CONTENT_PUBLICATION_STATUS_CONFLICT');
      if (!seen.length) {
        const [inserted] = await connection.execute<ResultSetHeader>(
          'INSERT INTO growth_publication_observations (organization_id,website_id,content_id,channel,issuer,event_id,payload_hash,observation_json) VALUES (?,?,?,?,?,?,?,?)',
          [claim.organizationId,claim.websiteId,claim.contentId,claim.channel,o.issuer,o.eventId,payloadHash,JSON.stringify(input)]);
        if (inserted.affectedRows !== 1) throw Error('PUBLICATION_EVIDENCE_PERSISTENCE_FAILED');
      }
      if (row.status === 'unknown' && target !== 'unknown') {
        if (record.stage !== 'publication_unknown') throw Error('CONTENT_PUBLICATION_STATUS_CONFLICT');
        if (o.result.kind === 'published') await advance(connection,record,{kind:'confirm_publication',eventId:'probe_'+payloadHash,at:o.issuedAt,
          providerId:o.result.providerId,url:o.result.url,observedAt:o.issuedAt},o.issuer);
        const [result] = await connection.execute<ResultSetHeader>(
          'UPDATE growth_publication_claims SET status=?,provider_id=?,publication_url=? WHERE organization_id=? AND website_id=? AND content_id=? AND channel=? AND claim_hash=? AND status=?',
          [target,o.result.kind === 'published' ? o.result.providerId : null,o.result.kind === 'published' ? o.result.url : null,
            claim.organizationId,claim.websiteId,claim.contentId,claim.channel,publicationClaimHash(claim),'unknown']);
        if (result.affectedRows !== 1) throw Error('PUBLICATION_STATUS_CONFLICT');
      }
      await connection.commit(); return target;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
}
