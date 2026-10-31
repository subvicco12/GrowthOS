import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { MySQLIsolatedWorkflows, type WorkScope } from './mysql-isolated-workflows';
import { assertApprovalNotRevoked, assertOwnershipGrant, readStopFence, bumpStopFence } from './session03-authority';
import { retryBackoffMs, decodeOperationCursor, encodeOperationCursor, type OperationStream } from '../core/isolated-operations';
import { analyzeManualEvidence, assertObservationTime, createAnalysisInput, type AnalysisResult } from '../core/isolated-workflows';
import { encryptConnectorKey, decryptConnectorKey, validateSyntheticConnectorEndpoint, localSyntheticHealthAdapter, signSyntheticHealth, verifySyntheticHealth, type SyntheticHealthAdapter, type SyntheticHealthPayload } from './synthetic-connector-security';
import type { OwnershipTransport } from './bounded-ownership-fetch';
type Row=RowDataPacket & Record<string,any>;
const params=(s:WorkScope)=>[s.organizationId,s.websiteId];
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const json=(value:any)=>typeof value==='string'?JSON.parse(value):value;
export type WorkerLease={jobId:string;token:string;fence:number;expiresAt:string};

export class MySQLIsolatedOperations extends MySQLIsolatedWorkflows {
  constructor(pool:Pick<Pool,'getConnection'>,ownership:OwnershipTransport,now:()=>number=Date.now,
    private readonly health:SyntheticHealthAdapter=localSyntheticHealthAdapter, private readonly master:()=>string=()=>process.env.GROWTHOS_DEV_CONNECTOR_KEY||'') {super(pool,ownership,now);}
  private async guard(c:PoolConnection,s:WorkScope,roles:readonly string[]=['owner','admin']){
    const site=await this.site(c,s,roles);
    const [version]=await c.execute<Row[]>('SELECT contract_version FROM growth_dev_s03_contract WHERE id=1');
    if(version[0]?.contract_version!=='session03-v1')throw Error('ISOLATED_SCHEMA_REQUIRED');
    return site;
  }
  private async history(c:PoolConnection,s:WorkScope,jobId:string,fence:number,event:string){
    await c.execute('INSERT INTO growth_dev_worker_history(id,organization_id,website_id,job_id,actor_id,fence,event_type) VALUES (?,?,?,?,?,?,?)',[randomUUID(),...params(s),jobId,s.actorId,fence,event]);
    await this.event(c,s,jobId,event);
  }
  async revokeOwnership(s:WorkScope,onlyExpired=false){return this.transaction(async c=>{
    await this.guard(c,s);
    const [grants]=await c.execute<Row[]>('SELECT epoch,valid_until,revoked_at FROM growth_dev_ownership_grants WHERE organization_id=? AND website_id=? FOR UPDATE',params(s));
    const grant=grants[0];if(!grant||grant.revoked_at)return {changed:false};
    if(onlyExpired&&new Date(grant.valid_until).getTime()>this.now())return {changed:false};
    await c.execute('UPDATE growth_dev_ownership_grants SET revoked_at=?,epoch=epoch+1 WHERE organization_id=? AND website_id=?',[new Date(this.now()),...params(s)]);
    const [sites]=await c.execute<Row[]>('SELECT automation_enabled,auto_publish_enabled FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE',params(s));
    for(const [field,feature] of [['automation_enabled','automation'],['auto_publish_enabled','auto_publish']]){
      if(sites[0]?.[field]===1||sites[0]?.[field]===true||sites[0]?.[field]==='1')await c.execute('INSERT INTO growth_website_feature_audit(id,organization_id,website_id,actor_id,feature,enabled) VALUES (?,?,?,?,?,FALSE)',[randomUUID(),...params(s),s.actorId,feature]);
    }
    await bumpStopFence(c,s);
    await c.execute('UPDATE growth_websites SET verified_at=NULL,automation_enabled=FALSE,auto_publish_enabled=FALSE WHERE organization_id=? AND id=?',params(s));
    await c.execute("UPDATE growth_dev_connector_enrollments SET state='revoked',health_state='unknown' WHERE organization_id=? AND website_id=?",params(s));
    await c.execute("UPDATE growth_dev_connector_drafts SET state='revoked' WHERE organization_id=? AND website_id=?",params(s));
    await this.event(c,s,s.websiteId,onlyExpired?'ownership_expired':'ownership_revoked');return {changed:true,externalAction:false};
  });}
  async enroll(s:WorkScope,endpoint:string){return this.transaction(async c=>{
    const site=await this.guard(c,s),epoch=await assertOwnershipGrant(c,s,this.now());
    if(site.platform!=='wordpress'||['paused','archived'].includes(site.status))throw Error('CONNECTOR_PREREQUISITE_REQUIRED');
    validateSyntheticConnectorEndpoint(site.domain,endpoint);
    const [existing]=await c.execute<Row[]>('SELECT id FROM growth_dev_connector_enrollments WHERE organization_id=? AND website_id=? FOR UPDATE',params(s));
    const id=existing[0]?.id||randomUUID(),secret=randomBytes(32).toString('base64url'),binding=[s.organizationId,s.websiteId,id,epoch,endpoint].join('|');
    const encrypted=encryptConnectorKey(secret,this.master(),binding),fingerprint=digest(secret);
    await c.execute("INSERT INTO growth_dev_connector_enrollments(id,organization_id,website_id,authority_epoch,endpoint,encrypted_key,fingerprint,state) VALUES (?,?,?,?,?,?,?,'enrolled') ON DUPLICATE KEY UPDATE authority_epoch=VALUES(authority_epoch),endpoint=VALUES(endpoint),encrypted_key=VALUES(encrypted_key),fingerprint=VALUES(fingerprint),state='enrolled',health_state='unknown',checked_at=NULL",[id,...params(s),epoch,endpoint,encrypted,fingerprint]);
    await this.event(c,s,id,'synthetic_connector_enrolled');return {id,mode:'synthetic_readonly',fingerprint,credentialExposed:false,externalAction:false};
  });}
  async revokeConnector(s:WorkScope){return this.transaction(async c=>{
    await this.guard(c,s);await c.execute("UPDATE growth_dev_connector_enrollments SET state='revoked',health_state='unknown' WHERE organization_id=? AND website_id=?",params(s));
    await this.event(c,s,s.websiteId,'synthetic_connector_revoked');return {revoked:true,externalAction:false};
  });}
  async checkHealth(s:WorkScope){
    const state=await this.transaction(async c=>{
      const site=await this.guard(c,s),epoch=await assertOwnershipGrant(c,s,this.now());
      if(['paused','archived'].includes(site.status))throw Error('WEBSITE_STOPPED');
      const [rows]=await c.execute<Row[]>('SELECT * FROM growth_dev_connector_enrollments WHERE organization_id=? AND website_id=? FOR UPDATE',params(s));const row=rows[0];
      if(!row||row.state!=='enrolled'||Number(row.authority_epoch)!==epoch)throw Error('CONNECTOR_ENROLLMENT_REQUIRED');
      validateSyntheticConnectorEndpoint(site.domain,row.endpoint);
      const binding=[s.organizationId,s.websiteId,row.id,epoch,row.endpoint].join('|');
      return {id:row.id,epoch,endpoint:row.endpoint,fingerprint:row.fingerprint,secret:decryptConnectorKey(row.encrypted_key,this.master(),binding)};
    });
    const payload:SyntheticHealthPayload={connectorId:state.id,websiteId:s.websiteId,endpoint:state.endpoint,nonce:randomUUID(),observedAt:new Date(this.now()).toISOString(),status:'ok',mode:'synthetic',capabilities:['read_only']};
    let ok=false;let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const response=await Promise.race([this.health.read(payload,signSyntheticHealth(payload,state.secret),state.secret),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('SYNTHETIC_HEALTH_TIMEOUT')),1000);})]);
      if(Buffer.byteLength(JSON.stringify(response))>4096)throw Error('HEALTH_RESPONSE_TOO_LARGE');
      verifySyntheticHealth(response.payload,response.signature,payload,state.secret);ok=true;
    }catch{ok=false;}finally{if(timer)clearTimeout(timer);}
    return this.transaction(async c=>{
      await this.guard(c,s);const epoch=await assertOwnershipGrant(c,s,this.now());
      const [rows]=await c.execute<Row[]>('SELECT id,state,fingerprint,authority_epoch FROM growth_dev_connector_enrollments WHERE organization_id=? AND website_id=? FOR UPDATE',params(s));
      if(epoch!==state.epoch||rows[0]?.state!=='enrolled'||rows[0]?.fingerprint!==state.fingerprint||Number(rows[0]?.authority_epoch)!==epoch)throw Error('CONNECTOR_ENROLLMENT_REQUIRED');
      await c.execute('UPDATE growth_dev_connector_enrollments SET health_state=?,checked_at=? WHERE organization_id=? AND website_id=?',[ok?'synthetic_healthy':'failed',new Date(this.now()),...params(s)]);
      await this.event(c,s,state.id,ok?'synthetic_connector_health_ok':'synthetic_connector_health_failed');return {state:ok?'synthetic_healthy':'failed',mode:'synthetic',externalRequests:0};
    });
  }
  async revokeApproval(s:WorkScope,approvalId:string,reason:string){return this.transaction(async c=>{
    await this.guard(c,s);const [rows]=await c.execute<Row[]>('SELECT id FROM growth_approval_queue WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[...params(s),approvalId]);
    if(!rows.length)throw Error('APPROVAL_NOT_FOUND');
    const [previous]=await c.execute<Row[]>('SELECT approval_id FROM growth_dev_approval_revocations WHERE organization_id=? AND website_id=? AND approval_id=?',[...params(s),approvalId]);
    if(!previous.length){await c.execute('INSERT INTO growth_dev_approval_revocations(organization_id,website_id,approval_id,actor_id,reason) VALUES (?,?,?,?,?)',[...params(s),approvalId,s.actorId,reason]);await this.event(c,s,approvalId,'approval_revoked');}
    return {revoked:true,externalAction:false};
  });}
  private async job(c:PoolConnection,s:WorkScope,id:string){
    const [rows]=await c.execute<Row[]>('SELECT j.*,a.status AS approval_status FROM growth_dev_analysis_jobs j JOIN growth_approval_queue a ON a.organization_id=j.organization_id AND a.website_id=j.website_id AND a.id=j.approval_id WHERE j.organization_id=? AND j.website_id=? AND j.id=? FOR UPDATE',[...params(s),id]);
    if(!rows[0])throw Error('JOB_NOT_FOUND');return rows[0];
  }
  private async executionAuthority(c:PoolConnection,s:WorkScope,site:Row,job:Row){
    if(['paused','archived'].includes(site.status))throw Error('WEBSITE_STOPPED');
    await assertApprovalNotRevoked(c,s,job.approval_id);if(job.approval_status!=='approved')throw Error('APPROVAL_REQUIRED');
    const [shutdowns]=await c.execute<Row[]>('SELECT id FROM growth_website_feature_audit WHERE organization_id=? AND website_id=? FOR UPDATE',params(s));
    if(json(job.input_json).stopFence!==await readStopFence(c,s)||json(job.input_json).shutdownCount!==shutdowns.length)throw Error('WEBSITE_STOPPED');
  }
  async claim(s:WorkScope,jobId:string):Promise<WorkerLease>{return this.transaction(async c=>{
    const site=await this.guard(c,s),job=await this.job(c,s,jobId);await this.executionAuthority(c,s,site,job);
    if(!['awaiting_approval','scheduled'].includes(job.status)||job.attempts>=3)throw Error('JOB_STATE_CONFLICT');
    if(new Date(job.run_after).getTime()>this.now())throw Error('JOB_NOT_DUE');
    const [leases]=await c.execute<Row[]>('SELECT fence,expires_at,token_hash FROM growth_dev_worker_leases WHERE organization_id=? AND website_id=? AND job_id=? FOR UPDATE',[...params(s),jobId]);
    const fence=Number(leases[0]?.fence||0)+1;if(!Number.isSafeInteger(fence))throw Error('LEASE_FENCE_EXHAUSTED');
    if(leases[0]?.token_hash&&new Date(leases[0].expires_at).getTime()>this.now())throw Error('LEASE_BUSY');
    const token=randomBytes(32).toString('base64url'),expiresAt=new Date(this.now()+30000).toISOString();
    await c.execute('INSERT INTO growth_dev_worker_leases(job_id,organization_id,website_id,owner_id,fence,token_hash,expires_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id),fence=VALUES(fence),token_hash=VALUES(token_hash),expires_at=VALUES(expires_at)',[jobId,...params(s),s.actorId,fence,digest(token),new Date(expiresAt)]);
    await c.execute("UPDATE growth_dev_analysis_jobs SET status='running',attempts=attempts+1,error_code=NULL,updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?",[...params(s),jobId]);
    await this.history(c,s,jobId,fence,'worker_claimed');return {jobId,token,fence,expiresAt};
  });}
  private async lease(c:PoolConnection,s:WorkScope,lease:WorkerLease){
    const [rows]=await c.execute<Row[]>('SELECT * FROM growth_dev_worker_leases WHERE organization_id=? AND website_id=? AND job_id=? FOR UPDATE',[...params(s),lease.jobId]);
    const row=rows[0];if(!row||row.owner_id!==s.actorId||Number(row.fence)!==lease.fence||row.token_hash!==digest(lease.token)||new Date(row.expires_at).getTime()<=this.now())throw Error('LEASE_LOST');return row;
  }
  async heartbeat(s:WorkScope,lease:WorkerLease){return this.transaction(async c=>{
    const site=await this.guard(c,s),job=await this.job(c,s,lease.jobId);await this.lease(c,s,lease);await this.executionAuthority(c,s,site,job);
    if(job.status!=='running')throw Error('LEASE_LOST');
    const expiresAt=new Date(this.now()+30000).toISOString();await c.execute('UPDATE growth_dev_worker_leases SET expires_at=? WHERE organization_id=? AND website_id=? AND job_id=?',[new Date(expiresAt),...params(s),lease.jobId]);
    await this.history(c,s,lease.jobId,lease.fence,'worker_heartbeat');return {expiresAt};
  });}
  async compute(s:WorkScope,lease:WorkerLease):Promise<AnalysisResult>{
    const input=await this.transaction(async c=>{
      const site=await this.guard(c,s),job=await this.job(c,s,lease.jobId);await this.lease(c,s,lease);await this.executionAuthority(c,s,site,job);
      if(job.status!=='running')throw Error('LEASE_LOST');
      const input=createAnalysisInput.parse(json(job.input_json).request);
      if(input.organizationId!==s.organizationId||input.websiteId!==s.websiteId||digest(JSON.stringify(input))!==job.input_hash)throw Error('INVALID_EVIDENCE');
      assertObservationTime(input.observedAt,new Date(this.now()).toISOString(),this.now());return {input,domain:site.domain};
    });
    return analyzeManualEvidence(input.input,input.domain);
  }
  async finish(s:WorkScope,lease:WorkerLease,result:AnalysisResult){return this.transaction(async c=>{
    const site=await this.guard(c,s),job=await this.job(c,s,lease.jobId);await this.lease(c,s,lease);await this.executionAuthority(c,s,site,job);
    if(job.status!=='running')throw Error('LEASE_LOST');
    // Recompute under the final authority fence: caller-supplied/altered adapter output is never trusted.
    const input=createAnalysisInput.parse(json(job.input_json).request);assertObservationTime(input.observedAt,new Date(this.now()).toISOString(),this.now());
    if(digest(JSON.stringify(input))!==job.input_hash)throw Error('INVALID_EVIDENCE');
    const expected=analyzeManualEvidence(input,site.domain);if(JSON.stringify(expected)!==JSON.stringify(result))throw Error('INVALID_SYNTHETIC_RESULT');
    for(const item of result.recommendations.slice(0,100)){
      const approvalId=await this.approval(c,s,item.title,'manual_recommendation');
      await c.execute('INSERT INTO growth_dev_analysis_recommendations(id,organization_id,website_id,job_id,category,title,rationale,evidence_url,priority,approval_id) VALUES (?,?,?,?,?,?,?,?,?,?)',[randomUUID(),...params(s),job.id,item.category,item.title,item.rationale,item.evidenceUrl,item.priority,approvalId]);
    }
    await c.execute("UPDATE growth_dev_analysis_jobs SET status='completed',result_json=?,updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?",[JSON.stringify({...result,persistedRecommendationLimit:100}),...params(s),job.id]);
    await c.execute('UPDATE growth_dev_worker_leases SET token_hash=NULL WHERE organization_id=? AND website_id=? AND job_id=?',[...params(s),job.id]);await this.history(c,s,job.id,lease.fence,'worker_completed');return {status:'completed',externalSpendMinor:'0'};
  });}
  async fail(s:WorkScope,lease:WorkerLease,reason='SYNTHETIC_TRANSIENT_FAILURE'){return this.transaction(async c=>{
    const site=await this.guard(c,s);const job=await this.job(c,s,lease.jobId);await this.lease(c,s,lease);if(job.status!=='running')throw Error('LEASE_LOST');
    let stopped=false;try{await this.executionAuthority(c,s,site,job);}catch{stopped=true;}
    const retry=!stopped&&Number(job.attempts)<3&&!['INVALID_EVIDENCE','INVALID_OBSERVATION_TIME','INVALID_SYNTHETIC_RESULT'].includes(reason),code=stopped?'AUTHORITY_STOPPED':['INVALID_EVIDENCE','INVALID_OBSERVATION_TIME'].includes(reason)?'INVALID_EVIDENCE':'SYNTHETIC_TRANSIENT_FAILURE';
    await c.execute('UPDATE growth_dev_analysis_jobs SET status=?,error_code=?,run_after=?,updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?',[stopped?'cancelled':retry?'scheduled':'failed',code,new Date(this.now()+retryBackoffMs(Number(job.attempts))),...params(s),job.id]);
    await c.execute('UPDATE growth_dev_worker_leases SET token_hash=NULL WHERE organization_id=? AND website_id=? AND job_id=?',[...params(s),job.id]);await this.history(c,s,job.id,lease.fence,retry?'worker_retry_scheduled':'worker_failed');return {status:stopped?'cancelled':retry?'scheduled':'failed'};
  });}
  async cancelJob(s:WorkScope,jobId:string){return this.transaction(async c=>{
    await this.guard(c,s);const job=await this.job(c,s,jobId);if(job.status==='completed')throw Error('JOB_STATE_CONFLICT');if(job.status==='cancelled')return {status:'cancelled'};
    await c.execute("UPDATE growth_dev_analysis_jobs SET status='cancelled',updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?",[...params(s),jobId]);
    const [leases]=await c.execute<Row[]>('SELECT fence FROM growth_dev_worker_leases WHERE organization_id=? AND website_id=? AND job_id=? FOR UPDATE',[...params(s),jobId]);
    if(leases[0])await c.execute('UPDATE growth_dev_worker_leases SET fence=fence+1,token_hash=NULL WHERE organization_id=? AND website_id=? AND job_id=?',[...params(s),jobId]);
    await this.history(c,s,jobId,Number(leases[0]?.fence||0),'worker_cancelled');return {status:'cancelled'};
  });}
  async recover(s:WorkScope){return this.transaction(async c=>{
    const site=await this.guard(c,s);const [rows]=await c.execute<Row[]>('SELECT j.id FROM growth_dev_analysis_jobs j JOIN growth_dev_worker_leases l ON l.job_id=j.id AND l.organization_id=j.organization_id AND l.website_id=j.website_id WHERE j.organization_id=? AND j.website_id=? AND j.status=\'running\' AND l.expires_at<=? ORDER BY j.id LIMIT 25',[...params(s),new Date(this.now())]);
    let recovered=0;
    for(const row of rows){
      const job=await this.job(c,s,row.id);const [leases]=await c.execute<Row[]>('SELECT fence,expires_at FROM growth_dev_worker_leases WHERE organization_id=? AND website_id=? AND job_id=? FOR UPDATE',[...params(s),job.id]);
      if(job.status!=='running'||!leases[0]||new Date(leases[0].expires_at).getTime()>this.now())continue;
      let status=Number(job.attempts)<3?'scheduled':'failed',code='WORKER_INTERRUPTED';
      try{await this.executionAuthority(c,s,site,job);}catch{status='cancelled';code='AUTHORITY_STOPPED';}
      await c.execute('UPDATE growth_dev_analysis_jobs SET status=?,error_code=?,run_after=?,updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?',[status,code,new Date(this.now()+retryBackoffMs(Number(job.attempts))),...params(s),job.id]);
      await c.execute('UPDATE growth_dev_worker_leases SET fence=fence+1,token_hash=NULL WHERE organization_id=? AND website_id=? AND job_id=?',[...params(s),job.id]);await this.history(c,s,job.id,Number(leases[0].fence),'worker_recovered');recovered++;
    }return {recovered};
  });}
  async tick(s:WorkScope,signal?:AbortSignal){
    if(signal?.aborted)return {processed:0,externalAction:false};
    await this.revokeOwnership(s,true);
    await this.recover(s);
    const ids=await this.transaction(async c=>{await this.guard(c,s);const [rows]=await c.execute<Row[]>('SELECT j.id FROM growth_dev_analysis_jobs j JOIN growth_approval_queue a ON a.id=j.approval_id AND a.organization_id=j.organization_id AND a.website_id=j.website_id LEFT JOIN growth_dev_approval_revocations r ON r.approval_id=a.id AND r.organization_id=a.organization_id AND r.website_id=a.website_id WHERE j.organization_id=? AND j.website_id=? AND j.status IN (\'awaiting_approval\',\'scheduled\') AND j.attempts<3 AND j.run_after<=? AND a.status=\'approved\' AND r.approval_id IS NULL ORDER BY j.run_after,j.id LIMIT 25',[...params(s),new Date(this.now())]);return rows.map(r=>r.id as string);});
    for(const id of ids){if(signal?.aborted)break;let lease:WorkerLease;try{lease=await this.claim(s,id);}catch(error){if((error as Error).message==='WEBSITE_STOPPED'){try{await this.cancelJob(s,id);}catch{/* A concurrent stop/recovery will retry next cycle. */}continue;}if(['WORKFLOW_BUSY','JOB_STATE_CONFLICT','LEASE_BUSY'].includes((error as Error).message))continue;throw error;}
      try{const result=await this.compute(s,lease);if(signal?.aborted)throw Error('WORKER_INTERRUPTED');await this.finish(s,lease,result);return {processed:1,jobId:id,status:'completed',externalAction:false};}
      catch(error){try{await this.fail(s,lease,(error as Error).message);}catch{/* Lost/uncertain leases require recovery, never blind completion. */}return {processed:1,jobId:id,status:'held_or_retry',externalAction:false};}
    }return {processed:0,externalAction:false};
  }
  async operations(s:WorkScope,stream:OperationStream,rawCursor?:string){return this.transaction(async c=>{
    const site=await this.guard(c,s,['owner','admin','editor','viewer']),cursor=decodeOperationCursor(rawCursor,s.organizationId,s.websiteId,stream);
    if(stream==='overview'){
      if(cursor)throw Error('INVALID_CURSOR');
      const [counts]=await c.execute<Row[]>('SELECT status,COUNT(*) AS total FROM growth_dev_analysis_jobs WHERE organization_id=? AND website_id=? GROUP BY status',params(s));
      const [grants]=await c.execute<Row[]>('SELECT epoch,valid_until,revoked_at FROM growth_dev_ownership_grants WHERE organization_id=? AND website_id=?',params(s));
      const [connectors]=await c.execute<Row[]>('SELECT id,state,health_state,checked_at,fingerprint,endpoint FROM growth_dev_connector_enrollments WHERE organization_id=? AND website_id=?',params(s));
      const [[stale]]=await c.execute<Row[]>('SELECT COUNT(*) AS total FROM growth_dev_worker_leases l JOIN growth_dev_analysis_jobs j ON j.id=l.job_id AND j.organization_id=l.organization_id AND j.website_id=l.website_id WHERE l.organization_id=? AND l.website_id=? AND j.status=\'running\' AND l.expires_at<=?',[...params(s),new Date(this.now())]);
      const grant=grants[0],ownership=!grant?'unverified':grant.revoked_at?'revoked':new Date(grant.valid_until).getTime()<=this.now()?'expired':'current';
      return {counts:counts.map(r=>({status:r.status,total:Number(r.total)})),expiredLeases:Number(stale.total),websiteStatus:site.status,
        ownership:{state:ownership,validUntil:grant?new Date(grant.valid_until).toISOString():null,epoch:grant?Number(grant.epoch):0},
        connector:connectors[0]||null,externalSpendMinor:'0',mode:'synthetic_readonly',nextCursor:null};
    }
    const config={jobs:{table:'growth_dev_analysis_jobs',alias:'j',time:'created_at',fields:'j.id,j.status,j.source_label,j.observed_at,j.input_hash,j.attempts,j.run_after,j.error_code,j.approval_id',join:''},
      recommendations:{table:'growth_dev_analysis_recommendations',alias:'j',time:'created_at',fields:'j.id,j.job_id,j.title,j.rationale,j.priority,j.evidence_url,j.approval_id,a.status,p.input_hash,p.source_label,p.observed_at',join:' JOIN growth_approval_queue a ON a.id=j.approval_id AND a.organization_id=j.organization_id AND a.website_id=j.website_id JOIN growth_dev_analysis_jobs p ON p.id=j.job_id AND p.organization_id=j.organization_id AND p.website_id=j.website_id'},
      events:{table:'growth_dev_workflow_events',alias:'j',time:'recorded_at',fields:'j.id,j.resource_id,j.event_type',join:''},
      attempts:{table:'growth_dev_worker_history',alias:'j',time:'recorded_at',fields:'j.id,j.job_id,j.fence,j.event_type',join:''}}[stream];
    const at=`j.${config.time}`;
    const [rows]=await c.execute<Row[]>(`SELECT ${config.fields},DATE_FORMAT(${at},'%Y-%m-%d %H:%i:%s.%f') AS position_at FROM ${config.table} j${config.join} WHERE j.organization_id=? AND j.website_id=?`+(cursor?` AND (${at}<? OR (${at}=? AND j.id<?))`:'')+` ORDER BY ${at} DESC,j.id DESC LIMIT 26`,cursor?[...params(s),cursor.at,cursor.at,cursor.id]:params(s));
    const page=rows.slice(0,25),last=page.at(-1);
    return {items:page.map(({position_at,...row})=>({...row,recordedAt:position_at.replace(' ','T')+'Z',...(stream==='jobs'?{provenance:'UNVERIFIED_MANUAL_INPUT'}:{})})),
      nextCursor:rows.length>25&&last?encodeOperationCursor({organizationId:s.organizationId,websiteId:s.websiteId,stream,at:last.position_at,id:last.id}):null};
  });}
}
