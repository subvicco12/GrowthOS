/** Candidate 010–013 scheduled job writer. Supplied connection only; never dispatches. */
import {createHash} from 'node:crypto';
import type {PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import type {FactoryScope} from '../core/content-factory';
import type {ContentRecord} from '../core/content-lifecycle';
import {createPublicationJob,type JobDestination} from '../core/safe-publication-jobs';
import {contentAuthorizationHash} from '../core/publication-authorization';
import {decodeFactoryEnvelope} from './mysql-content-factory-store';
type Row=RowDataPacket&Record<string,unknown>;
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const id=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export interface DurableScheduleAuthority {
 readonly capability:'durable-publication-schedule-v1';
 /** Current session, membership, approved event, website policy and destination; no cached health. */
 bind(c:PoolConnection,scope:FactoryScope,record:ContentRecord,at:string):Promise<{jobId:string;destination:JobDestination}>;
 recheck(c:PoolConnection,scope:FactoryScope,record:ContentRecord,at:string):Promise<void>;
}
export class MySQLPublicationJobScheduler {
 constructor(private readonly authority:DurableScheduleAuthority){if(authority?.capability!=='durable-publication-schedule-v1'||typeof authority.bind!=='function'||typeof authority.recheck!=='function')throw Error('SCHEDULE_AUTHORITY_REQUIRED');}
 async schedule(c:PoolConnection,scope:FactoryScope,record:ContentRecord,at:string):Promise<void>{
  if(![scope.organizationId,scope.websiteId,scope.contentId].every(id)||record.organizationId!==scope.organizationId||record.websiteId!==scope.websiteId||record.id!==scope.contentId||record.stage!=='scheduled'||!record.factoryReviewDigest||!Number.isFinite(Date.parse(at)))throw Error('SCHEDULE_SCOPE_DENIED');
  const [rs]=await c.execute<Row[]>('SELECT version,record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,scope.contentId]);
  if(rs.length!==1)throw Error('SCHEDULE_CONTENT_NOT_PERSISTED');
  const canonical=decodeFactoryEnvelope(rs[0],scope);
  if(canonical.record.version!==record.version||contentAuthorizationHash(canonical.record)!==contentAuthorizationHash(record)||!canonical.humanApproval||canonical.record.factoryReviewDigest!==record.factoryReviewDigest)throw Error('SCHEDULE_APPROVAL_OR_VERSION_CHANGED');
  const binding=await this.authority.bind(c,scope,canonical.record,at);
  if(!id(binding?.jobId))throw Error('SCHEDULE_JOB_ID_DENIED');
  const job=createPublicationJob(canonical.record,{id:binding.jobId,destination:binding.destination});
  await this.authority.recheck(c,scope,canonical.record,at);
  const [r]=await c.execute<ResultSetHeader>('INSERT INTO growth_publication_jobs (organization_id,website_id,id,content_id,channel,content_version,content_hash,destination_id,destination_revision,destination_target_hash,version,state,not_before,job_json) VALUES (?,?,?,?,?,?,?,?,?,?,0,\'scheduled\',?,?)',
   [scope.organizationId,scope.websiteId,job.id,scope.contentId,job.channel,job.contentVersion,job.contentHash,job.destination.id,job.destination.revision,sha(job.destination.target),new Date(job.notBefore),JSON.stringify(job)]);
  if(r.affectedRows!==1)throw Error('SCHEDULE_JOB_INSERT_FAILED');
  await this.authority.recheck(c,scope,canonical.record,at);
 }
}
