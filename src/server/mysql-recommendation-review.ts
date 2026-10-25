import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { ReviewEvent, ReviewRecord, ReviewStore, ReviewTransaction } from '../core/offline-recommendation-review';

type RecommendationRow = RowDataPacket & { id:string;organization_id:string;website_id:string;evidence_hash:string;
  expires_at:string;evidence_revoked_at:string|null;revision:number;state:ReviewRecord['status'] };
type EventRow = RowDataPacket & { organization_id:string;website_id:string;recommendation_id:string;actor_id:string;
  decision:ReviewEvent['decision'];reason:string;evidence_hash:string;previous_revision:number;revision:number;idempotency_key:string;decided_at:string };

/** Candidate 016 adapter. Unbound to runtime APIs until independently certified in disposable MariaDB. */
export class MySQLRecommendationReviewStore implements ReviewStore {
  constructor(private readonly pool:Pick<Pool,'getConnection'>) {}
  async transaction<T>(fn:(tx:ReviewTransaction)=>Promise<T>):Promise<T> {
    const connection:PoolConnection=await this.pool.getConnection();
    let commitStarted=false;
    try {
      await connection.beginTransaction();
      const value=await fn(this.participant(connection));
      commitStarted=true;
      await connection.commit();
      return value;
    } catch(error) {
      if(commitStarted)throw Error('REVIEW_COMMIT_UNKNOWN_OPERATOR_HOLD');
      try { await connection.rollback(); } catch { throw Error('REVIEW_ROLLBACK_UNKNOWN_OPERATOR_HOLD'); }
      throw error;
    } finally { connection.release(); }
  }
  private participant(connection:PoolConnection):ReviewTransaction {
    return {
      lock:async(organizationId,websiteId,id)=>{
        const [rows]=await connection.execute<RecommendationRow[]>(
          'SELECT id,organization_id,website_id,evidence_hash,evidence_revoked_at,DATE_FORMAT(evidence_expires_at,\'%Y-%m-%dT%H:%i:%s.%fZ\') AS expires_at,revision,state FROM growth_recommendations WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
          [organizationId,websiteId,id]);
        if(rows.length!==1)return null;
        const row=rows[0];if(row.evidence_revoked_at!==null)throw Error('REVIEW_EVIDENCE_STALE');
        return {id:row.id,organizationId:row.organization_id,websiteId:row.website_id,
          evidenceHash:row.evidence_hash,expiresAt:row.expires_at,revision:Number(row.revision),status:row.state};
      },
      assertCurrentEvidence:async(organizationId,websiteId,id,now)=>{
        const [sources]=await connection.execute<(RowDataPacket & {original_evidence_id:string|null;source_hash:string;
          observed_at:string;expires_at:string;source_kind:string})[]>(
          'SELECT original_evidence_id,source_hash,source_kind,DATE_FORMAT(observed_at,\'%Y-%m-%dT%H:%i:%s.%fZ\') AS observed_at,DATE_FORMAT(expires_at,\'%Y-%m-%dT%H:%i:%s.%fZ\') AS expires_at FROM growth_recommendation_evidence WHERE organization_id=? AND website_id=? AND recommendation_id=? ORDER BY original_evidence_id,id',
          [organizationId,websiteId,id]);
        if(!sources.length)throw Error('REVIEW_EVIDENCE_AUTHORITY_UNAVAILABLE');
        const seen=new Set<string>();
        for(const source of sources){
          if(source.source_kind!=='manual_page'||!source.original_evidence_id||
            !/^[0-9a-f]{64}$/.test(source.source_hash)||!Number.isFinite(Date.parse(source.expires_at))||
            Date.parse(source.expires_at)<=Date.parse(now))throw Error('REVIEW_EVIDENCE_AUTHORITY_UNAVAILABLE');
          if(seen.has(source.original_evidence_id))throw Error('REVIEW_EVIDENCE_AUTHORITY_UNAVAILABLE');
          seen.add(source.original_evidence_id);
          // The FK on 015 events references this parent. Its lock must serialize a
          // concurrent revocation INSERT; certify this behavior with two live sessions.
          const [evidence]=await connection.execute<(RowDataPacket & {payload_hash:string;observed_at:string;expires_at:string})[]>(
            'SELECT payload_hash,DATE_FORMAT(observed_at,\'%Y-%m-%dT%H:%i:%s.%fZ\') AS observed_at,DATE_FORMAT(expires_at,\'%Y-%m-%dT%H:%i:%s.%fZ\') AS expires_at FROM growth_intelligence_evidence WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
            [organizationId,websiteId,source.original_evidence_id]);
          if(evidence.length!==1||evidence[0].payload_hash!==source.source_hash||
            evidence[0].observed_at!==source.observed_at||evidence[0].expires_at!==source.expires_at||
            !Number.isFinite(Date.parse(evidence[0].expires_at))||Date.parse(evidence[0].expires_at)<=Date.parse(now))
            throw Error('REVIEW_EVIDENCE_STALE');
          const [events]=await connection.execute<(RowDataPacket & {event_type:string})[]>(
            'SELECT event_type FROM growth_intelligence_evidence_events WHERE organization_id=? AND website_id=? AND evidence_id=? ORDER BY event_type',
            [organizationId,websiteId,source.original_evidence_id]);
          if(events.length!==1||events[0].event_type!=='ingested')throw Error('REVIEW_EVIDENCE_STALE');
        }
      },
      findIdempotency:async(organizationId,key)=>{
        const [rows]=await connection.execute<EventRow[]>(
          'SELECT organization_id,website_id,recommendation_id,actor_id,decision,reason,evidence_hash,previous_revision,revision,idempotency_key,DATE_FORMAT(decided_at,\'%Y-%m-%dT%H:%i:%s.%fZ\') AS decided_at FROM growth_recommendation_review_events WHERE organization_id=? AND idempotency_key=? LIMIT 1',
          [organizationId,key]);
        if(rows.length!==1)return null;
        const row=rows[0];return {organizationId:row.organization_id,websiteId:row.website_id,recommendationId:row.recommendation_id,
          actorId:row.actor_id,decision:row.decision,reason:row.reason,evidenceHash:row.evidence_hash,previousRevision:Number(row.previous_revision),
          revision:Number(row.revision),idempotencyKey:row.idempotency_key,at:row.decided_at};
      },
      append:async event=>{
        const [written]=await connection.execute<ResultSetHeader>(
          'INSERT INTO growth_recommendation_review_events (organization_id,website_id,recommendation_id,id,actor_id,decision,reason,previous_revision,revision,idempotency_key,evidence_hash,decided_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [event.organizationId,event.websiteId,event.recommendationId,randomUUID(),event.actorId,event.decision,event.reason,
            event.previousRevision,event.revision,event.idempotencyKey,event.evidenceHash,new Date(event.at).toISOString().slice(0,23).replace('T',' ')]);
        if(written.affectedRows!==1)throw Error('REVIEW_EVENT_WRITE_FAILED');
      },
      compareAndSwap:async(previous,next)=>{
        const [written]=await connection.execute<ResultSetHeader>(
          'UPDATE growth_recommendations SET state=?,revision=?,updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=? AND revision=? AND state=? AND evidence_hash=? AND evidence_expires_at>UTC_TIMESTAMP(6) AND evidence_revoked_at IS NULL',
          [next.status,next.revision,previous.organizationId,previous.websiteId,previous.id,previous.revision,previous.status,previous.evidenceHash]);
        return written.affectedRows===1;
      }
    };
  }
}
