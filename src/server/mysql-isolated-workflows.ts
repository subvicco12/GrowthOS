import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { analyzeManualEvidence, assertObservationTime, createAnalysisInput, type CreateAnalysis, type AnalysisAction, type WorkflowView } from '../core/isolated-workflows';
import { recordOwnershipGrant, assertOwnershipGrant, assertApprovalNotRevoked, readStopFence } from './session03-authority';
import type { OwnershipTransport } from './bounded-ownership-fetch';

type Row = RowDataPacket & Record<string, any>;
export type WorkScope = { organizationId: string; websiteId: string; actorId: string };
const stamp = (value: string | Date): string => new Date(value).toISOString();
const parse = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const scopeParams = (scope: WorkScope) => [scope.organizationId, scope.websiteId];

export class MySQLIsolatedWorkflows {
  constructor(protected readonly pool: Pick<Pool, 'getConnection'>, private readonly ownership: OwnershipTransport, protected readonly now: () => number = Date.now) {}
  protected async transaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection(); let committing = false;
    try {
      await connection.beginTransaction();
      const value = await fn(connection); committing = true; await connection.commit(); return value;
    } catch (error) {
      try { await connection.rollback(); } catch { throw Error('WORKFLOW_OUTCOME_UNKNOWN'); }
      if (committing) throw Error('WORKFLOW_OUTCOME_UNKNOWN');
      if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','ER_CHECKREAD'].includes((error as { code?: string }).code || '')) throw Error('WORKFLOW_BUSY');
      throw error;
    } finally { connection.release(); }
  }
  protected async site(connection: PoolConnection, scope: WorkScope, roles: readonly string[] = ['owner','admin']) {
    const [contract] = await connection.execute<Row[]>("SELECT contract_version FROM growth_dev_contract WHERE id=1");
    if (contract[0]?.contract_version !== 'session02-v1') throw Error('ISOLATED_SCHEMA_REQUIRED');
    const [members] = await connection.execute<Row[]>('SELECT m.role FROM growth_memberships m JOIN growth_users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=? AND u.disabled=FALSE FOR UPDATE', [scope.organizationId,scope.actorId]);
    if (!members[0] || !roles.includes(members[0].role)) throw Error('INSUFFICIENT_ROLE');
    const [sites] = await connection.execute<Row[]>('SELECT domain,platform,status,verified_at FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE', scopeParams(scope));
    if (sites.length !== 1) throw Error('WEBSITE_NOT_FOUND');
    return sites[0];
  }
  protected async event(connection: PoolConnection, scope: WorkScope, resourceId: string, eventType: string) {
    await connection.execute('INSERT INTO growth_dev_workflow_events(id,organization_id,website_id,actor_id,resource_id,event_type) VALUES (?,?,?,?,?,?)',
      [randomUUID(), scope.organizationId, scope.websiteId, scope.actorId, resourceId, eventType]);
  }
  protected async approval(connection: PoolConnection, scope: WorkScope, title: string, actionType: string): Promise<string> {
    const id = randomUUID();
    await connection.execute('INSERT INTO growth_approval_queue(id,organization_id,website_id,title,action_type) VALUES (?,?,?,?,?)',
      [id, scope.organizationId, scope.websiteId, title.slice(0,240), actionType]); return id;
  }
  async view(scope: WorkScope): Promise<WorkflowView & { connectorDraft: { id: string; state: string; endpoint: string } | null; ownershipChallenge: { id: string; state: string; attempts: number; expiresAt: string } | null }> {
    return this.transaction(async connection => {
      const site = await this.site(connection, scope, ['owner','admin','editor','viewer']);
      const [jobs] = await connection.execute<Row[]>(
        'SELECT j.*,a.status AS approval_status FROM growth_dev_analysis_jobs j JOIN growth_approval_queue a ON a.organization_id=j.organization_id AND a.website_id=j.website_id AND a.id=j.approval_id WHERE j.organization_id=? AND j.website_id=? ORDER BY j.created_at DESC,j.id DESC LIMIT 25', scopeParams(scope));
      const [recommendations] = await connection.execute<Row[]>(
        'SELECT r.*,a.status FROM growth_dev_analysis_recommendations r JOIN growth_approval_queue a ON a.organization_id=r.organization_id AND a.website_id=r.website_id AND a.id=r.approval_id WHERE r.organization_id=? AND r.website_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 100', scopeParams(scope));
      const [events] = await connection.execute<Row[]>('SELECT id,resource_id,event_type,recorded_at FROM growth_dev_workflow_events WHERE organization_id=? AND website_id=? ORDER BY recorded_at DESC,id DESC LIMIT 50', scopeParams(scope));
      const [connectors] = await connection.execute<Row[]>('SELECT id,state,endpoint FROM growth_dev_connector_drafts WHERE organization_id=? AND website_id=?', scopeParams(scope));
      const [challenges] = await connection.execute<Row[]>('SELECT id,state,attempts,expires_at FROM growth_dev_ownership WHERE organization_id=? AND website_id=? ORDER BY created_at DESC,id DESC LIMIT 1', scopeParams(scope));
      return { organizationId: scope.organizationId, websiteId: scope.websiteId, domain: site.domain, platform: site.platform,
        websiteStatus: site.status, verifiedAt: site.verified_at ? stamp(site.verified_at) : null,
        connectorDraft: connectors[0] ? { id: connectors[0].id, state: connectors[0].state, endpoint: connectors[0].endpoint } : null,
        ownershipChallenge: challenges[0] ? { id: challenges[0].id, state: challenges[0].state, attempts: challenges[0].attempts, expiresAt: stamp(challenges[0].expires_at) } : null,
        jobs: jobs.map(j => ({ id: j.id, status: j.status, sourceLabel: j.source_label, observedAt: stamp(j.observed_at), runAfter: stamp(j.run_after),
          attempts: j.attempts, errorCode: j.error_code, approvalId: j.approval_id, approvalStatus: j.approval_status, result: j.result_json ? parse(j.result_json) : null })),
        recommendations: recommendations.map(r => ({ id: r.id, jobId: r.job_id, category: r.category, title: r.title, rationale: r.rationale,
          evidenceUrl: r.evidence_url, priority: r.priority, approvalId: r.approval_id, status: r.status })),
        events: events.map(e => ({ id: e.id, resourceId: e.resource_id, eventType: e.event_type, recordedAt: stamp(e.recorded_at) })),
        limits: { jobsPerDay: 20, maxAttempts: 3, externalSpendMinor: '0', liveExecution: false } };
    });
  }
  async connectorDraft(scope: WorkScope, revoke: boolean) {
    return this.transaction(async connection => {
      const site = await this.site(connection, scope);
      if (['paused','archived'].includes(site.status) && !revoke) throw Error('WEBSITE_STOPPED');
      if (process.env.GROWTHOS_SESSION03_DISPOSABLE === 'YES' && !revoke) await assertOwnershipGrant(connection,scope,this.now());
      if (!site.verified_at || site.platform !== 'wordpress') throw Error('CONNECTOR_PREREQUISITE_REQUIRED');
      const [rows] = await connection.execute<Row[]>('SELECT id FROM growth_dev_connector_drafts WHERE organization_id=? AND website_id=? FOR UPDATE', scopeParams(scope));
      const id = rows[0]?.id || randomUUID(), state = revoke ? 'revoked' : 'draft', endpoint = `https://${site.domain}/wp-json/growthos/v1/`;
      await connection.execute('INSERT INTO growth_dev_connector_drafts(id,organization_id,website_id,actor_id,state,endpoint) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE state=VALUES(state),actor_id=VALUES(actor_id),updated_at=UTC_TIMESTAMP(6)',
        [id,...scopeParams(scope),scope.actorId,state,endpoint]);
      await this.event(connection,scope,id,revoke ? 'connector_draft_revoked' : 'connector_draft_prepared');
      return { id, state, endpoint, activated: false, credentialState: 'unavailable' };
    });
  }
  async issueOwnership(scope: WorkScope) {
    return this.transaction(async connection => {
      const site = await this.site(connection, scope);
      if (site.status === 'archived') throw Error('WEBSITE_STOPPED');
      const [[count]] = await connection.execute<Row[]>('SELECT COUNT(*) AS total FROM growth_dev_ownership WHERE organization_id=? AND website_id=? AND created_at>=UTC_TIMESTAMP()-INTERVAL 1 DAY', scopeParams(scope));
      if (Number(count.total) >= 5) throw Error('OWNERSHIP_RATE_LIMIT');
      const id = randomUUID(), token = randomBytes(32).toString('base64url'), expiresAt = new Date(this.now()+30*60000).toISOString();
      await connection.execute("UPDATE growth_dev_ownership SET state='superseded' WHERE organization_id=? AND website_id=? AND state IN ('pending','checking','failed')", scopeParams(scope));
      await connection.execute('INSERT INTO growth_dev_ownership(id,organization_id,website_id,actor_id,domain,token_hash,expires_at) VALUES (?,?,?,?,?,?,?)',
        [id, scope.organizationId, scope.websiteId, scope.actorId, site.domain, hash(token), new Date(expiresAt)]);
      await this.event(connection, scope, id, 'ownership_challenge_issued');
      return { id, token, expiresAt, challengeUrl: `https://${site.domain}/.well-known/growthos-verification.txt`, fileContent: `growthos-verification=${token}` };
    });
  }
  async verifyOwnership(scope: WorkScope, challengeId: string, token: string) {
    const domain = await this.transaction(async connection => {
      const site = await this.site(connection, scope);
      if (site.status === 'archived') throw Error('WEBSITE_STOPPED');
      const [rows] = await connection.execute<Row[]>('SELECT * FROM growth_dev_ownership WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE', [...scopeParams(scope), challengeId]);
      const challenge = rows[0];
      if (!challenge || !['pending','failed'].includes(challenge.state) || challenge.attempts >= 3 || new Date(challenge.expires_at).getTime() <= this.now() || challenge.domain !== site.domain) throw Error('OWNERSHIP_CHALLENGE_INVALID');
      if (!timingSafeEqual(Buffer.from(challenge.token_hash, 'hex'), Buffer.from(hash(token), 'hex'))) throw Error('OWNERSHIP_CHALLENGE_INVALID');
      await connection.execute("UPDATE growth_dev_ownership SET state='checking',attempts=attempts+1 WHERE organization_id=? AND website_id=? AND id=?", [...scopeParams(scope), challengeId]);
      await this.event(connection, scope, challengeId, 'ownership_check_started'); return site.domain as string;
    });
    let matched = false, errorCode: string | null = null;
    try { matched = (await this.ownership.read(domain)).trim() === `growthos-verification=${token}`; if (!matched) errorCode = 'OWNERSHIP_PROOF_MISMATCH'; }
    catch { errorCode = 'OWNERSHIP_TRANSPORT_UNAVAILABLE'; }
    return this.transaction(async connection => {
      const site = await this.site(connection, scope);
      const [rows] = await connection.execute<Row[]>('SELECT * FROM growth_dev_ownership WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE', [...scopeParams(scope), challengeId]);
      const challenge = rows[0];
      if (!challenge || challenge.state !== 'checking' || challenge.domain !== site.domain || site.status === 'archived' || new Date(challenge.expires_at).getTime() <= this.now()) throw Error('OWNERSHIP_CHALLENGE_INVALID');
      await connection.execute('UPDATE growth_dev_ownership SET state=? WHERE organization_id=? AND website_id=? AND id=?', [matched ? 'verified' : 'failed', ...scopeParams(scope), challengeId]);
      if (matched) {
        await connection.execute('UPDATE growth_websites SET verified_at=UTC_TIMESTAMP() WHERE organization_id=? AND id=?', scopeParams(scope));
        if (process.env.GROWTHOS_SESSION03_DISPOSABLE === 'YES') await recordOwnershipGrant(connection,scope,challengeId,this.now());
      }
      await this.event(connection, scope, challengeId, matched ? 'ownership_verified' : 'ownership_check_failed');
      return { verified: matched, errorCode, connectorActivated: false };
    });
  }
  async createAnalysis(scope: WorkScope, input: CreateAnalysis) {
    return this.transaction(async connection => {
      const site = await this.site(connection, scope, ['owner','admin','editor']);
      if (['paused','archived'].includes(site.status)) throw Error('WEBSITE_STOPPED');
      assertObservationTime(input.observedAt, input.runAfter, this.now());
      analyzeManualEvidence(input, site.domain); // Reject forged cross-site observations before storing anything.
      const digest = hash(JSON.stringify(input));
      const [existing] = await connection.execute<Row[]>('SELECT id,input_hash FROM growth_dev_analysis_jobs WHERE organization_id=? AND website_id=? AND request_key=?', [...scopeParams(scope), input.requestKey]);
      if (existing[0]) { if (existing[0].input_hash !== digest) throw Error('IDEMPOTENCY_CONFLICT'); return { id: existing[0].id as string, duplicate: true }; }
      const [[count]] = await connection.execute<Row[]>('SELECT COUNT(*) AS total FROM growth_dev_analysis_jobs WHERE organization_id=? AND website_id=? AND created_at>=UTC_TIMESTAMP()-INTERVAL 1 DAY', scopeParams(scope));
      if (Number(count.total) >= 20) throw Error('ANALYSIS_QUOTA_EXCEEDED');
      const [shutdowns] = await connection.execute<Row[]>('SELECT id FROM growth_website_feature_audit WHERE organization_id=? AND website_id=? FOR UPDATE', scopeParams(scope));
      const stopFence = process.env.GROWTHOS_SESSION03_DISPOSABLE === 'YES' ? await readStopFence(connection,scope) : undefined;
      const id = randomUUID(), approvalId = await this.approval(connection, scope, 'Analyze manual evidence: ' + input.sourceLabel, 'manual_analysis');
      await connection.execute('INSERT INTO growth_dev_analysis_jobs(id,organization_id,website_id,actor_id,request_key,input_hash,source_label,observed_at,input_json,approval_id,run_after) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [id, ...scopeParams(scope), scope.actorId, input.requestKey, digest, input.sourceLabel, new Date(input.observedAt), JSON.stringify({ request: input, shutdownCount: shutdowns.length, stopFence }), approvalId, new Date(input.runAfter)]);
      await this.event(connection, scope, id, 'analysis_created_awaiting_approval'); return { id, duplicate: false };
    });
  }
  async action(scope: WorkScope, input: AnalysisAction) {
    return this.transaction(async connection => {
      const site = await this.site(connection, scope);
      const [rows] = await connection.execute<Row[]>('SELECT j.*,a.status AS approval_status FROM growth_dev_analysis_jobs j JOIN growth_approval_queue a ON a.organization_id=j.organization_id AND a.website_id=j.website_id AND a.id=j.approval_id WHERE j.organization_id=? AND j.website_id=? AND j.id=? FOR UPDATE', [...scopeParams(scope), input.jobId]);
      const job = rows[0]; if (!job) throw Error('JOB_NOT_FOUND');
      if (input.action === 'cancel') {
        if (job.status === 'completed') throw Error('JOB_STATE_CONFLICT');
        if (job.status !== 'cancelled') { await connection.execute("UPDATE growth_dev_analysis_jobs SET status='cancelled',updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?", [...scopeParams(scope), job.id]); await this.event(connection, scope, job.id, 'analysis_cancelled'); }
        return { status: 'cancelled', externalAction: false };
      }
      if (['paused','archived'].includes(site.status)) throw Error('WEBSITE_STOPPED');
      const storedInput = parse(job.input_json);
      if (process.env.GROWTHOS_SESSION03_DISPOSABLE === 'YES' && storedInput.stopFence !== await readStopFence(connection,scope)) throw Error('WEBSITE_STOPPED');
      const [shutdowns] = await connection.execute<Row[]>('SELECT id FROM growth_website_feature_audit WHERE organization_id=? AND website_id=? FOR UPDATE', scopeParams(scope));
      if (!Number.isSafeInteger(storedInput.shutdownCount) || storedInput.shutdownCount !== shutdowns.length) throw Error('WEBSITE_STOPPED');
      if (['completed','cancelled','running'].includes(job.status)) throw Error('JOB_STATE_CONFLICT');
      if (process.env.GROWTHOS_SESSION03_DISPOSABLE === 'YES' && ['retry','schedule'].includes(input.action) && job.error_code && new Date(job.run_after).getTime()>this.now()) {
        const [leases]=await connection.execute<Row[]>('SELECT job_id FROM growth_dev_worker_leases WHERE organization_id=? AND website_id=? AND job_id=?',[...scopeParams(scope),job.id]);
        if (leases.length && (input.action==='retry' || (input.action==='schedule' && Date.parse(input.runAfter)<new Date(job.run_after).getTime()))) throw Error('JOB_NOT_DUE');
      }
      if (input.action === 'schedule') {
        assertObservationTime(stamp(job.observed_at), input.runAfter, this.now());
        await connection.execute('UPDATE growth_dev_analysis_jobs SET run_after=?,updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?', [new Date(input.runAfter), ...scopeParams(scope), job.id]);
        await this.event(connection, scope, job.id, 'analysis_rescheduled'); return { status: job.status, externalAction: false };
      }
      if (input.action === 'retry') {
        if (job.status !== 'failed' || job.attempts >= 3) throw Error('JOB_STATE_CONFLICT');
        await connection.execute("UPDATE growth_dev_analysis_jobs SET status='scheduled',error_code=NULL,run_after=UTC_TIMESTAMP(6),updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?", [...scopeParams(scope), job.id]);
        await this.event(connection, scope, job.id, 'analysis_retry_scheduled'); return { status: 'scheduled', externalAction: false };
      }
      if (job.status === 'failed' || job.attempts >= 3) throw Error('JOB_STATE_CONFLICT');
      if (process.env.GROWTHOS_SESSION03_DISPOSABLE === 'YES') await assertApprovalNotRevoked(connection,scope,job.approval_id);
      if (job.approval_status !== 'approved') throw Error('APPROVAL_REQUIRED');
      if (new Date(job.run_after).getTime() > this.now()) throw Error('JOB_NOT_DUE');
      await connection.execute("UPDATE growth_dev_analysis_jobs SET status='running',attempts=attempts+1,updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?", [...scopeParams(scope), job.id]);
      await this.event(connection, scope, job.id, 'analysis_started');
      let result: ReturnType<typeof analyzeManualEvidence>;
      try {
        const evidence = createAnalysisInput.parse(storedInput.request);
        if (evidence.organizationId !== scope.organizationId || evidence.websiteId !== scope.websiteId || hash(JSON.stringify(evidence)) !== job.input_hash) throw Error('EVIDENCE_INTEGRITY_FAILED');
        assertObservationTime(evidence.observedAt, new Date(this.now()).toISOString(), this.now()); result = analyzeManualEvidence(evidence, site.domain);
      } catch {
        await connection.execute("UPDATE growth_dev_analysis_jobs SET status='failed',error_code='INVALID_OR_STALE_EVIDENCE',updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?", [...scopeParams(scope), job.id]);
        await this.event(connection, scope, job.id, 'analysis_failed'); return { status: 'failed', externalAction: false };
      }
      // Finite local work only; no provider, crawler, worker, or spending authority exists here.
      for (const recommendation of result.recommendations.slice(0,100)) {
        const approvalId = await this.approval(connection, scope, recommendation.title, 'manual_recommendation');
        await connection.execute('INSERT INTO growth_dev_analysis_recommendations(id,organization_id,website_id,job_id,category,title,rationale,evidence_url,priority,approval_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [randomUUID(), ...scopeParams(scope), job.id, recommendation.category, recommendation.title, recommendation.rationale, recommendation.evidenceUrl, recommendation.priority, approvalId]);
      }
      await connection.execute("UPDATE growth_dev_analysis_jobs SET status='completed',result_json=?,error_code=NULL,updated_at=UTC_TIMESTAMP(6) WHERE organization_id=? AND website_id=? AND id=?", [JSON.stringify({ ...result, persistedRecommendationLimit: 100 }), ...scopeParams(scope), job.id]);
      await this.event(connection, scope, job.id, 'analysis_completed'); return { status: 'completed', externalAction: false };
    });
  }
}
