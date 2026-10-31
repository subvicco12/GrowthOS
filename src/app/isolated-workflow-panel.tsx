'use client';
import { useEffect, useRef, useState } from 'react';
import type { WorkflowView } from '../core/isolated-workflows';
import type { WebsiteSummary } from '../core/workspace-journey';
import { workspaceError } from './workspace-response';

type View = WorkflowView & { ownershipChallenge: { id: string; state: string; attempts: number; expiresAt: string } | null;
  connectorDraft: { id: string; state: string; endpoint: string } | null };
type Props = { organizationId: string; site: WebsiteSummary; role: string; onAccessDenied: () => void };
export function IsolatedWorkflowPanel({ organizationId, site, role, onAccessDenied }: Props) {
  const [view, setView] = useState<View | null>(null), [message, setMessage] = useState('Loading isolated workflows…');
  const [busy, setBusy] = useState(false), [unavailable, setUnavailable] = useState(false);
  const [proof, setProof] = useState<{ id: string; token: string; fileContent: string; challengeUrl: string } | null>(null);
  const [source, setSource] = useState(''), [pages, setPages] = useState(''), [competitors, setCompetitors] = useState('');
  const [observedAt, setObservedAt] = useState(''), [runAfter, setRunAfter] = useState('');
  const [reschedule, setReschedule] = useState<Record<string, string>>({});
  const pendingCreate = useRef<unknown>(null);
  const active = useRef(false), lock = useRef(false), controller = useRef<AbortController | null>(null), key = useRef('');
  const denied = useRef(onAccessDenied); denied.current = onAccessDenied;
  const admin = ['owner','admin'].includes(role), canCreate = ['owner','admin','editor'].includes(role);
  const base = { organizationId, websiteId: site.id };
  async function check(response: Response): Promise<Record<string, any>> {
    if (response.status === 401 || response.status === 403) { setView(null); setProof(null); denied.current(); throw workspaceError(response, 'Workflow'); }
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 501) { setUnavailable(true); throw Error('Isolated workflow schema 017 is not enabled. Existing website settings remain available.'); }
      if (response.status >= 500) throw Error('Operation outcome unavailable. Reload records before retrying.');
      throw Error(String(data.code || 'Workflow request refused'));
    }
    if (data.ok !== true) throw Error('Workflow response could not be verified.');
    return data;
  }
  async function refresh(signal: AbortSignal) {
    const data = await check(await fetch('/api/isolated-workflows?' + new URLSearchParams(base), { credentials: 'include', cache: 'no-store', signal }));
    if (!active.current || signal.aborted) return;
    if (data.organizationId !== organizationId || data.websiteId !== site.id || data.domain !== site.domain ||
      !Array.isArray(data.jobs) || !Array.isArray(data.recommendations) || !Array.isArray(data.events)) throw Error('Workflow scope changed. Reload this workspace.');
    setView(data as View); setUnavailable(false);
    if (data.verifiedAt !== site.verifiedAt && (data.verifiedAt === null || (typeof data.verifiedAt === 'string' && Number.isFinite(Date.parse(data.verifiedAt)))))
      window.dispatchEvent(new CustomEvent('growthos-website-updated', { detail: { organizationId, website: { ...site, verifiedAt: data.verifiedAt } } }));
  }
  async function load() {
    if (lock.current) return; lock.current = true; setBusy(true); setMessage('');
    const next = new AbortController(); controller.current = next;
    try { await refresh(next.signal); } catch (error) { if (active.current && !next.signal.aborted) setMessage(error instanceof Error ? error.message : 'Workflow unavailable.'); }
    finally { if (active.current && !next.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => { active.current = true; lock.current = false; void load(); return () => { active.current = false; controller.current?.abort(); }; }, [organizationId, site.id]);
  async function mutate(method: string, body: unknown, url = '/api/isolated-workflows') {
    if (lock.current || unavailable) return; lock.current = true; setBusy(true); setMessage('');
    const next = new AbortController(); controller.current = next;
    try {
      const data = await check(await fetch(url, { method, credentials: 'include', cache: 'no-store', signal: next.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      if (!active.current || next.signal.aborted) return;
      if (url === '/api/isolated-workflows' && (data.organizationId !== organizationId || data.websiteId !== site.id)) throw Error('Workflow scope changed. Reload before retrying.');
      if (url === '/api/admin/approvals/decide' && data.externalAction !== false) throw Error('Unexpected execution response. Stop and review.');
      if (data.result?.token) setProof(data.result);
      if (data.result?.verified === true) { setProof(null); setMessage('Ownership proof matched. Reload website settings to view the updated verification. No connector or automation was activated.'); }
      else if (data.result?.verified === false) setMessage('Ownership was not verified: ' + data.result.errorCode + '. Check the file and operator host allowlist.');
      else setMessage('Internal records saved. No publishing or external automation started.');
      if (method === 'POST' && url === '/api/isolated-workflows') key.current = '';
      await refresh(next.signal);
    } catch (error) { if (active.current && !next.signal.aborted) setMessage(error instanceof Error ? error.message : 'Operation unavailable. Reload records.'); }
    finally { if (active.current && !next.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  function create(event: import('react').FormEvent) {
    event.preventDefault(); if (!canCreate) return;
    try {
      const evidence = { websiteId: site.id, pages: JSON.parse(pages), ...(competitors.trim() ? { competitors: JSON.parse(competitors) } : {}) };
      const observationTime = new Date(observedAt).toISOString(), scheduledTime = runAfter ? new Date(runAfter).toISOString() : new Date().toISOString();
      if (!key.current) { key.current = crypto.randomUUID(); pendingCreate.current = { ...base, requestKey: key.current, sourceLabel: source, observedAt: observationTime, runAfter: scheduledTime, evidence }; }
      void mutate('POST', pendingCreate.current);
    } catch { setMessage('Supply valid observation JSON and an observation date before creating an analysis.'); }
  }
  function action(jobId: string, action: string) {
    const date = reschedule[jobId];
    if (action === 'schedule' && (!date || !Number.isFinite(Date.parse(date)))) { setMessage('Choose a valid scheduled time.'); return; }
    void mutate('PATCH', { ...base, jobId, action, ...(action === 'schedule' ? { runAfter: new Date(date).toISOString() } : {}) });
  }
  function approve(approvalId: string, decision: 'approved' | 'rejected') {
    void mutate('POST', { ...base, approvalId, decision, idempotencyKey: crypto.randomUUID(), note: 'Internal manual analysis review; no execution authority granted.' }, '/api/admin/approvals/decide');
  }
  return <section className="panel isolatedWorkflow" aria-label="Ownership and durable analysis">
    <h3>Ownership and durable analysis</h3>
    <p>Proposal 017 is isolated-development only. Manual evidence remains unverified. No live crawler, paid provider, background dispatcher or publisher is enabled.</p>
    {message && <p role="status">{message}</p>}
    <button type="button" className="secondary" disabled={busy} onClick={() => void load()}>Reload workflow records</button>
    {view && <>
      <h4>Ownership and connector onboarding</h4>
      <p>Ownership: {view.verifiedAt ? 'proof recorded' : 'not verified'}. Connector credentials and live health: unavailable.</p>
      {admin && <div className="websiteControls">
        <button type="button" disabled={busy} onClick={() => void mutate('PATCH', { ...base, action: 'issue' })}>Create ownership challenge</button>
        <button type="button" disabled={busy || !view.verifiedAt || view.platform !== 'wordpress'} onClick={() => void mutate('PATCH', { ...base, action: 'prepare_connector' })}>Prepare connector draft</button>
        {view.connectorDraft?.state === 'draft' && <button type="button" disabled={busy} onClick={() => void mutate('PATCH', { ...base, action: 'revoke_connector' })}>Revoke connector draft</button>}
      </div>}
      {proof && <div><p>Place this exact text at <code>{proof.challengeUrl}</code>. The server stores only its hash. This token is shown only in this open panel; creating a new challenge supersedes it.</p>
        <pre>{proof.fileContent}</pre><p>Verification requires an operator allowlist entry for this public host. Redirects and private network addresses are rejected.</p>
        <button type="button" disabled={busy} onClick={() => void mutate('PATCH', { ...base, action: 'verify', challengeId: proof.id, token: proof.token })}>Verify ownership file</button></div>}
      {view.ownershipChallenge && <p>Latest challenge: {view.ownershipChallenge.state} · attempts {view.ownershipChallenge.attempts}/3 · expires {new Date(view.ownershipChallenge.expiresAt).toLocaleString()}</p>}
      {view.connectorDraft && <p>Connector draft: {view.connectorDraft.state} · endpoint {view.connectorDraft.endpoint} · not activated; no credential was collected.</p>}
      <h4>Persist manual technical and competitor research</h4>
      <p>Up to 20 page observations and 5 competitor claims per job. Each page needs url, status, indexable, h1Count, wordCount and internalLinks; title, description and canonical are optional. Competitors need evidenceUrl, featureName, plan (free/pro/business) and ourAvailability (present/absent/unknown). No URLs are fetched by analysis.</p>
      {canCreate && <form onSubmit={create} className="workflowForm">
        <label>Research source label<input required maxLength={200} value={source} onChange={event => { setSource(event.target.value); key.current = ''; }}/></label>
        <label>Observed at<input required type="datetime-local" value={observedAt} onChange={event => { setObservedAt(event.target.value); key.current = ''; }}/></label>
        <label>Run no earlier than<input type="datetime-local" value={runAfter} onChange={event => { setRunAfter(event.target.value); key.current = ''; }}/></label>
        <label>Page observations JSON<textarea required rows={7} maxLength={50000} value={pages} onChange={event => { setPages(event.target.value); key.current = ''; }}/></label>
        <label>Competitor claims JSON (optional)<textarea rows={4} maxLength={12000} value={competitors} onChange={event => { setCompetitors(event.target.value); key.current = ''; }}/></label>
        <button type="submit" disabled={busy || ['paused','archived'].includes(view.websiteStatus)}>Save analysis for internal approval</button>
      </form>}
      <p>Limits: 20 jobs per website per 24 hours, 3 attempts per job, external spend 0. Any subsequent feature-shutdown event invalidates earlier jobs; create a new internally reviewed job to continue. Scheduled jobs require an explicit manual run after approval; no background worker runs them.</p>
      <h4>Recent analysis jobs (up to 25)</h4>
      {!view.jobs.length && <p>No persisted analyses for this website.</p>}
      {view.jobs.map(job => <article key={job.id} className="auditEntry">
        <strong>{job.sourceLabel}</strong><p>{job.status} · approval {job.approvalStatus} · attempts {job.attempts}/3 · due {new Date(job.runAfter).toLocaleString()}</p>
        {job.errorCode && <p role="status">Failure: {job.errorCode}</p>}
        {job.result && <p>{job.result.seoFindings.length} technical/SEO findings · {job.result.featureCandidates.length} feature candidates · {job.result.competitors.length} competitor claims. Evidence: {job.result.evidence}; external spend {job.result.costMinor}.</p>}
        {job.result && <details><summary>Recorded technical findings and competitor claims</summary><pre>{JSON.stringify({ findings: job.result.seoFindings, competitors: job.result.competitors }, null, 2)}</pre></details>}
        {admin && <div className="websiteControls">
          {job.approvalStatus === 'pending' && <><button disabled={busy} type="button" onClick={() => approve(job.approvalId, 'approved')}>Approve internal analysis</button><button disabled={busy} type="button" onClick={() => approve(job.approvalId, 'rejected')}>Reject analysis</button></>}
          {['awaiting_approval','scheduled'].includes(job.status) && job.approvalStatus === 'approved' && <button type="button" disabled={busy || ['paused','archived'].includes(view.websiteStatus)} onClick={() => action(job.id, 'run')}>Run due local analysis</button>}
          {job.status === 'failed' && job.attempts < 3 && <button type="button" disabled={busy} onClick={() => action(job.id, 'retry')}>Schedule retry</button>}
          {!['completed','cancelled'].includes(job.status) && <>
            <button type="button" disabled={busy} onClick={() => action(job.id, 'cancel')}>Cancel analysis</button>
            <label>Reschedule analysis<input type="datetime-local" value={reschedule[job.id] || ''} onChange={event => setReschedule(old => ({ ...old, [job.id]: event.target.value }))}/></label>
            <button type="button" disabled={busy} onClick={() => action(job.id, 'schedule')}>Save scheduled time</button>
          </>}
        </div>}
      </article>)}
      <h4>Persisted recommendations and growth opportunities (up to 100)</h4>
      {!view.recommendations.length && <p>No persisted recommendations. Run an approved analysis to generate evidence-backed review items.</p>}
      {view.recommendations.map(item => <article key={item.id} className="auditEntry"><strong>{item.title}</strong><p>{item.priority} · {item.category} · internal status {item.status}</p><p>{item.rationale}</p><p>Evidence supplied: {item.evidenceUrl}</p>
        {admin && item.status === 'pending' && <div className="websiteControls"><button type="button" disabled={busy} onClick={() => approve(item.approvalId, 'approved')}>Approve for internal planning</button><button type="button" disabled={busy} onClick={() => approve(item.approvalId, 'rejected')}>Reject recommendation</button></div>}
      </article>)}
      <h4>Recent immutable workflow events (up to 50)</h4>
      <ul>{view.events.map(event => <li key={event.id}>{event.eventType} · {new Date(event.recordedAt).toLocaleString()}</li>)}</ul>
    </>}
  </section>;
}
