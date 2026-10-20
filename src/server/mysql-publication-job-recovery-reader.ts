/** Read-only candidate-013 diagnostics. Consistency is never a publication authorization. */
import {createHash} from 'node:crypto';
import type {Pool,RowDataPacket} from 'mysql2/promise';
import {parseStoredPublicationJob,type PublicationJob} from '../core/safe-publication-jobs';
import {publicationClaimHash} from './publication-evidence';
type Row=RowDataPacket&Record<string,unknown>;
const id=(v:string)=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const iso=(v:unknown)=>v instanceof Date?v.toISOString():String(v);
const deny=(code:string):never=>{throw Error(code);};
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
export interface PublicationJobRecoverySnapshot {
  job:PublicationJob;
  generationReservationId:string|null;
  publicationFundingId:string|null;
  fundingState:string|null;
  /** Diagnostic only. No issuer, anchor, session, quota or fence authority is supplied by a read. */
  publicationAuthorized:false;
}
/** Explicit pool only. Candidate 013 is not installed by this class. */
export class MySQLPublicationJobRecoveryReader {
  constructor(private readonly pool:Pick<Pool,'getConnection'>){if(!pool?.getConnection)deny('JOB_READER_POOL_REQUIRED');}
  async inspect(scope:{organizationId:string;websiteId:string;contentId:string},jobId:string):Promise<PublicationJobRecoverySnapshot>{
    if(![scope.organizationId,scope.websiteId,scope.contentId,jobId].every(id))deny('JOB_READER_SCOPE_DENIED');
    const c=await this.pool.getConnection();
    try{
      const [rows]=await c.execute<Row[]>('SELECT version,state,job_json,content_version,content_hash,channel,destination_id,destination_revision,destination_target_hash,not_before,authorization_id,claim_hash,publication_reservation_id,probe_attempts,next_probe_at,witness_generation,witness_lease_id FROM growth_publication_jobs WHERE organization_id=? AND website_id=? AND content_id=? AND id=?',[scope.organizationId,scope.websiteId,scope.contentId,jobId]);
      if(rows.length!==1)deny('JOB_READER_NOT_FOUND');const r=rows[0],job=parseStoredPublicationJob(typeof r.job_json==='string'?JSON.parse(r.job_json):r.job_json);
      if(job.id!==jobId||job.organizationId!==scope.organizationId||job.websiteId!==scope.websiteId||job.contentId!==scope.contentId||
        job.version!==Number(r.version)||job.state!==r.state||job.contentVersion!==Number(r.content_version)||job.contentHash!==r.content_hash||job.channel!==r.channel||
        job.destination.id!==r.destination_id||job.destination.revision!==r.destination_revision||sha(job.destination.target)!==r.destination_target_hash||
        Date.parse(job.notBefore)!==Date.parse(iso(r.not_before))||job.probeAttempts!==Number(r.probe_attempts)||
        (job.nextProbeAt===null?r.next_probe_at!==null:Date.parse(job.nextProbeAt)!==Date.parse(iso(r.next_probe_at))))deny('JOB_READER_ROW_MISMATCH');
      const [events]=await c.execute<Row[]>('SELECT event_id,resulting_version,operation,occurred_at,payload_hash,observation_issuer,observation_event_id,observation_hash FROM growth_publication_job_events WHERE organization_id=? AND website_id=? AND job_id=? ORDER BY resulting_version ASC',[scope.organizationId,scope.websiteId,jobId]);
      if(events.length!==job.version||job.journal.length!==events.length||events.some((e,i)=>e.event_id!==job.journal[i].eventId||Number(e.resulting_version)!==i+1||e.operation!==job.journal[i].operation||e.payload_hash!==job.journal[i].payloadHash||Date.parse(iso(e.occurred_at))!==Date.parse(job.journal[i].at)||
        (e.operation==='reconcile'?![e.observation_issuer,e.observation_event_id,e.observation_hash].every(x=>typeof x==='string'&&x.length>0):[e.observation_issuer,e.observation_event_id,e.observation_hash].some(x=>x!==null))))deny('JOB_READER_EVENT_CHAIN_MISMATCH');
      const last=events.at(-1);
      if((['confirmed','absent'].includes(job.state)&&last?.operation!=='reconcile')||
         (job.state==='operator_review'&&(job.probeAttempts!==5||!['probe_failed','reconcile'].includes(String(last?.operation)))))deny('JOB_READER_TERMINAL_EVIDENCE_MISSING');
      if(job.claim===null){
        if(!['scheduled','cancelled'].includes(job.state)||r.claim_hash!==null||r.authorization_id!==null||r.publication_reservation_id!==null||r.witness_generation!==null||r.witness_lease_id!==null)deny('JOB_READER_CLAIM_MISMATCH');
        return {job,generationReservationId:null,publicationFundingId:null,fundingState:null,publicationAuthorized:false};
      }
      const expectedHash=publicationClaimHash(job.claim);
      if(!id(job.claim.reservationId)||r.claim_hash!==expectedHash||typeof r.authorization_id!=='string'||!id(r.authorization_id)||typeof r.publication_reservation_id!=='string'||!id(r.publication_reservation_id)||typeof r.witness_generation!=='number'||!Number.isSafeInteger(r.witness_generation)||r.witness_generation<1||typeof r.witness_lease_id!=='string'||!id(r.witness_lease_id)||!['awaiting_status','confirmed','absent','operator_review'].includes(job.state))deny('JOB_READER_CLAIM_MISMATCH');
      const [bindings]=await c.execute<Row[]>('SELECT authorization_id,claim_hash,generation_reservation_id,publication_reservation_id,content_version,content_hash,destination_id,publication_operation FROM growth_publication_funding_bindings WHERE organization_id=? AND website_id=? AND content_id=? AND channel=?',[scope.organizationId,scope.websiteId,scope.contentId,job.channel]);
      if(bindings.length!==1||bindings[0].authorization_id!==r.authorization_id||bindings[0].claim_hash!==expectedHash||bindings[0].generation_reservation_id!==job.claim.reservationId||bindings[0].publication_reservation_id!==r.publication_reservation_id||Number(bindings[0].content_version)!==job.contentVersion||bindings[0].content_hash!==job.contentHash||bindings[0].destination_id!==job.destination.id||bindings[0].publication_operation!=='publication')deny('JOB_READER_BINDING_MISMATCH');
      const [funding]=await c.execute<Row[]>('SELECT id,content_id,operation,state FROM growth_quota_reservations_v2 WHERE organization_id=? AND website_id=? AND id=?',[scope.organizationId,scope.websiteId,String(r.publication_reservation_id)]);
      if(funding.length!==1||funding[0].id!==r.publication_reservation_id||funding[0].content_id!==scope.contentId||funding[0].operation!=='publication'||!['executing','completed','failed'].includes(String(funding[0].state)))deny('JOB_READER_FUNDING_MISMATCH');
      return {job,generationReservationId:job.claim.reservationId,publicationFundingId:String(r.publication_reservation_id),fundingState:String(funding[0].state),publicationAuthorized:false};
    }finally{c.release();}
  }
}
