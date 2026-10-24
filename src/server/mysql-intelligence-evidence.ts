import { createHash, randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { manualIntelligencePreview, previewInput, type PreviewInput } from '../core/manual-intelligence-preview';

type EvidenceRow = RowDataPacket & { id: string; payload_hash: string; source_label: string;
  observed_at: Date; expires_at: Date; ingested_at: Date; payload_json: string; revoked_at: Date | null };
type SiteRow = RowDataPacket & { domain: string };
export type ManualEvidenceInput = { organizationId: string; websiteId: string; actorId: string;
  idempotencyKey: string; sourceLabel: string; observedAt: string; expiresAt: string; pages: PreviewInput['pages'] };

function digest(input: ManualEvidenceInput): string {
  return createHash('sha256').update(JSON.stringify([input.sourceLabel, input.observedAt,
    input.expiresAt, input.pages])).digest('hex');
}
function validTime(input: ManualEvidenceInput, now: number) {
  const observed = Date.parse(input.observedAt), expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(observed) || !Number.isFinite(expires) || observed > now + 300000 ||
      observed < now - 7 * 86400000 || expires <= now || expires > now + 30 * 86400000 || expires <= observed) {
    throw Error('EVIDENCE_TIME_INVALID');
  }
}
/** Requires candidate 015 after independent certification. No trust or publication authority is returned. */
export class MySQLManualEvidenceStore {
  constructor(private readonly pool: Pick<Pool, 'getConnection'>) {}

  async record(input: ManualEvidenceInput, now = Date.now()): Promise<{ id: string; duplicate: boolean }> {
    if (!previewInput.safeParse({ websiteId: input.websiteId, pages: input.pages }).success ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey) ||
        !input.sourceLabel.trim() || input.sourceLabel.length > 200) throw Error('EVIDENCE_INPUT_INVALID');
    validTime(input, now);
    const hash = digest(input), id = randomUUID(), eventId = randomUUID();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [sites] = await connection.execute<SiteRow[]>(
        'SELECT domain FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE',
        [input.organizationId, input.websiteId]);
      if (sites.length !== 1) throw Error('WEBSITE_NOT_FOUND');
      manualIntelligencePreview({ websiteId: input.websiteId, pages: input.pages }, sites[0].domain);
      const [existing] = await connection.execute<EvidenceRow[]>(
        'SELECT id,payload_hash FROM growth_intelligence_evidence WHERE organization_id=? AND website_id=? AND idempotency_key=? FOR UPDATE',
        [input.organizationId, input.websiteId, input.idempotencyKey]);
      if (existing.length) {
        if (existing.length !== 1 || existing[0].payload_hash !== hash) throw Error('EVIDENCE_IDEMPOTENCY_CONFLICT');
        await connection.commit();
        return { id: existing[0].id, duplicate: true };
      }
      const [saved] = await connection.execute<ResultSetHeader>(
        `INSERT INTO growth_intelligence_evidence
         (id,organization_id,website_id,idempotency_key,actor_id,source_kind,source_label,observed_at,expires_at,payload_hash,payload_json)
         VALUES (?,?,?,?,?,'manual',?,?,?,?,?)`,
        [id,input.organizationId,input.websiteId,input.idempotencyKey,input.actorId,input.sourceLabel,
          new Date(input.observedAt),new Date(input.expiresAt),hash,JSON.stringify(input.pages)]);
      if (saved.affectedRows !== 1) throw Error('EVIDENCE_INSERT_FAILED');
      const [event] = await connection.execute<ResultSetHeader>(
        "INSERT INTO growth_intelligence_evidence_events (id,organization_id,website_id,evidence_id,actor_id,event_type) VALUES (?,?,?,?,?,'ingested')",
        [eventId,input.organizationId,input.websiteId,id,input.actorId]);
      if (event.affectedRows !== 1) throw Error('EVIDENCE_AUDIT_FAILED');
      await connection.commit();
      return { id, duplicate: false };
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  async revoke(scope: { organizationId: string; websiteId: string; evidenceId: string; actorId: string }): Promise<boolean> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<EvidenceRow[]>(
        'SELECT id FROM growth_intelligence_evidence WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
        [scope.organizationId,scope.websiteId,scope.evidenceId]);
      if (rows.length !== 1) throw Error('EVIDENCE_NOT_FOUND');
      const [revocations] = await connection.execute<EvidenceRow[]>(
        "SELECT id FROM growth_intelligence_evidence_events WHERE organization_id=? AND website_id=? AND evidence_id=? AND event_type='revoked'",
        [scope.organizationId,scope.websiteId,scope.evidenceId]);
      if (revocations.length) { await connection.commit(); return false; }
      const [event] = await connection.execute<ResultSetHeader>(
        "INSERT INTO growth_intelligence_evidence_events (id,organization_id,website_id,evidence_id,actor_id,event_type) VALUES (?,?,?,?,?,'revoked')",
        [randomUUID(),scope.organizationId,scope.websiteId,scope.evidenceId,scope.actorId]);
      if (event.affectedRows !== 1) throw Error('EVIDENCE_AUDIT_FAILED');
      await connection.commit(); return true;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  async list(organizationId: string, websiteId: string, now = Date.now()) {
    const connection = await this.pool.getConnection();
    try {
      const [sites] = await connection.execute<SiteRow[]>(
        'SELECT domain FROM growth_websites WHERE organization_id=? AND id=?', [organizationId,websiteId]);
      if (sites.length !== 1) throw Error('WEBSITE_NOT_FOUND');
      const [rows] = await connection.execute<EvidenceRow[]>(
        `SELECT e.id,e.source_label,e.observed_at,e.ingested_at,e.expires_at,e.payload_hash,e.payload_json,
          r.recorded_at AS revoked_at FROM growth_intelligence_evidence e
          LEFT JOIN growth_intelligence_evidence_events r ON r.evidence_id=e.id AND r.event_type='revoked'
          WHERE e.organization_id=? AND e.website_id=? ORDER BY e.ingested_at DESC,e.id DESC LIMIT 25`,
        [organizationId,websiteId]);
      return rows.map(row => ({ id: row.id, sourceLabel: row.source_label, observedAt: row.observed_at,
        ingestedAt: row.ingested_at, expiresAt: row.expires_at, payloadHash: row.payload_hash,
        state: row.revoked_at ? 'revoked' : new Date(row.expires_at).getTime() <= now ? 'expired' : 'unverified',
        pages: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json }));
    } finally { connection.release(); }
  }
}
