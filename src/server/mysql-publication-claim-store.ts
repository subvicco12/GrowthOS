import { createHash } from 'node:crypto';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getMySQLPool } from './mysql';
import type { PublicationClaim, PublicationClaimStore } from '../core/publication-handoff';
import type { ContentRecord } from '../core/content-lifecycle';

type Row = RowDataPacket & Record<string, unknown>;
const valid = (value: string) => typeof value === 'string' && /^[a-zA-Z0-9_:-]{1,200}$/.test(value);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** A claim is durable before any outbound attempt. Unknown results remain claimed forever until verified reconciliation. */
export class MySQLPublicationClaimStore implements PublicationClaimStore {
  constructor(private readonly pool: Pick<Pool, 'getConnection'> = getMySQLPool()) {}
  async claimOnce(claim: PublicationClaim): Promise<boolean> {
    if (![claim.organizationId,claim.websiteId,claim.contentId,claim.channel,claim.idempotencyKey,claim.reservationId].every(valid) ||
        claim.idempotencyKey !== `publish:${claim.organizationId}:${claim.websiteId}:${claim.contentId}:${claim.channel}`) throw Error('INVALID_PUBLICATION_CLAIM');
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [budget] = await connection.execute<Row[]>(
        'SELECT globally_paused FROM growth_organization_budgets WHERE organization_id=? FOR UPDATE', [claim.organizationId]);
      if (budget.length !== 1 || Number(budget[0].globally_paused) !== 0) throw Error('PUBLISHING_DISABLED');
      const [site] = await connection.execute<Row[]>(
        'SELECT status,verified_at,auto_publish_enabled FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE', [claim.organizationId,claim.websiteId]);
      if (site.length !== 1 || site[0].status !== 'active' || !site[0].verified_at || Number(site[0].auto_publish_enabled) !== 1) throw Error('PUBLISHING_DISABLED');
      const [content] = await connection.execute<Row[]>(
        'SELECT record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
        [claim.organizationId,claim.websiteId,claim.contentId]);
      if (content.length !== 1) throw Error('PUBLICATION_NOT_APPROVED');
      const record = (typeof content[0].record_json === 'string' ? JSON.parse(content[0].record_json) : content[0].record_json) as ContentRecord;
      if (record.id !== claim.contentId || record.organizationId !== claim.organizationId || record.websiteId !== claim.websiteId ||
          record.stage !== 'scheduled' || !record.approval || !record.quality ||
          !record.quality.factual || !record.quality.original || !record.quality.rightsCleared || !record.quality.disclosureChecked ||
          !record.schedule || record.schedule.channel !== claim.channel ||
          Date.parse(record.schedule.at) > Date.now()) throw Error('PUBLICATION_NOT_APPROVED');
      const [connector] = await connection.execute<Row[]>(
        'SELECT verified_at,status FROM growth_connector_health WHERE organization_id=? AND website_id=? AND channel=? FOR UPDATE',
        [claim.organizationId,claim.websiteId,claim.channel]);
      if (connector.length !== 1 || connector[0].status !== 'verified' || !connector[0].verified_at) throw Error('CONNECTOR_UNAVAILABLE');
      const [reservation] = await connection.execute<Row[]>(
        'SELECT status FROM growth_ai_reservations WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
        [claim.organizationId,claim.websiteId,claim.reservationId]);
      if (reservation.length !== 1 || reservation[0].status !== 'completed') throw Error('APPROVAL_OR_RESERVATION_REQUIRED');
      try {
        const [result] = await connection.execute<ResultSetHeader>(
          'INSERT INTO growth_publication_claims (organization_id,website_id,content_id,channel,claim_hash,reservation_id,status) VALUES (?,?,?,?,?,?,?)',
          [claim.organizationId,claim.websiteId,claim.contentId,claim.channel,hash(claim.idempotencyKey),claim.reservationId,'unknown']);
        if (result.affectedRows !== 1) throw Error('CLAIM_INSERT_FAILED');
      } catch (error) {
        if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
        await connection.rollback();
        return false;
      }
      await connection.commit();
      return true;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  /** Only a verified status probe can close an ambiguous claim. Never resets a claim for another outbound attempt. */
  async reconcile(claim: PublicationClaim, observation: { kind: 'published'; providerId: string; url: string } | { kind: 'absent' } | { kind: 'unknown' }): Promise<'confirmed' | 'absent' | 'unknown'> {
    if (![claim.organizationId,claim.websiteId,claim.contentId,claim.channel,claim.idempotencyKey].every(valid) ||
        claim.idempotencyKey !== `publish:${claim.organizationId}:${claim.websiteId}:${claim.contentId}:${claim.channel}`) throw Error('INVALID_PUBLICATION_CLAIM');
    if (observation.kind === 'published' && (!valid(observation.providerId) || !/^https:\/\/[^\s]+$/.test(observation.url))) throw Error('INVALID_PUBLICATION_EVIDENCE');
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<Row[]>(
        'SELECT status,provider_id,publication_url FROM growth_publication_claims WHERE organization_id=? AND website_id=? AND content_id=? AND channel=? AND claim_hash=? FOR UPDATE',
        [claim.organizationId,claim.websiteId,claim.contentId,claim.channel,hash(claim.idempotencyKey)]);
      if (rows.length !== 1) throw Error('CLAIM_NOT_FOUND');
      const row = rows[0];
      const target = observation.kind === 'published' ? 'confirmed' : observation.kind;
      if (row.status !== 'unknown' && row.status !== target) throw Error('PUBLICATION_STATUS_CONFLICT');
      if (row.status === 'confirmed' && (row.provider_id !== (observation.kind === 'published' && observation.providerId) || row.publication_url !== (observation.kind === 'published' && observation.url))) throw Error('PUBLICATION_STATUS_CONFLICT');
      if (row.status === 'unknown' && target !== 'unknown') {
        const [result] = await connection.execute<ResultSetHeader>(
          'UPDATE growth_publication_claims SET status=?,provider_id=?,publication_url=? WHERE organization_id=? AND website_id=? AND content_id=? AND channel=? AND claim_hash=? AND status=?',
          [target,observation.kind === 'published' ? observation.providerId : null,observation.kind === 'published' ? observation.url : null,
            claim.organizationId,claim.websiteId,claim.contentId,claim.channel,hash(claim.idempotencyKey),'unknown']);
        if (result.affectedRows !== 1) throw Error('PUBLICATION_STATUS_CONFLICT');
      }
      await connection.commit();
      return target;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
}
