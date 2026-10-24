'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { workspaceError } from './workspace-response';

type Site = { id: string; domain: string };
type Page = { websites: Site[]; nextCursor: string | null; organization: { id: string; role: string } };
type Result = { evidence: 'UNVERIFIED_MANUAL_INPUT'; seoFindings: { key: string; severity: string; evidence: string }[];
  featureCandidates: { featureKey: string; name: string; confidence: string }[];
  recommendations: { category: string; title: string; rationale: string; evidenceUrl: string }[] };
type Recorded = { id: string; sourceLabel: string; state: 'unverified' | 'expired' | 'revoked';
  observedAt: string; expiresAt: string; payloadHash: string };
type Observation = { websiteId: string; pages: { url: string; status: number; indexable: boolean; title: string; description?: string; canonical?: string;
  h1Count: number; wordCount: number; internalLinks: number }[] };

export function IntelligencePanel() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [canonical, setCanonical] = useState('');
  const [httpStatus, setHttpStatus] = useState('');
  const [indexable, setIndexable] = useState('');
  const [h1Count, setH1Count] = useState('');
  const [wordCount, setWordCount] = useState('');
  const [internalLinks, setInternalLinks] = useState('');
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [competitorFeature, setCompetitorFeature] = useState('');
  const [competitorPlan, setCompetitorPlan] = useState<'free'|'pro'|'business'>('free');
  const [ourAvailability, setOurAvailability] = useState<'present'|'absent'|'unknown'>('unknown');
  const [status, setStatus] = useState('Loading websites…');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('viewer');
  const [observation, setObservation] = useState<Observation | null>(null);
  const [requestKey, setRequestKey] = useState('');
  const [observationTime, setObservationTime] = useState('');
  const selectedSite = useRef('');
  const selectedOrganization = useRef('');
  const [recorded, setRecorded] = useState<Recorded[] | null>(null);
  const [recordedStatus, setRecordedStatus] = useState('');
  const [mutationHold, setMutationHold] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      const all: Site[] = []; let cursor: string | null = null; let organizationId: string | null = null; let currentRole = 'viewer';
      do {
        const response = await fetch('/api/organization-websites' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw workspaceError(response, 'Website registry');
        const page = await response.json() as Page;
        if (organizationId && organizationId !== page.organization.id) throw Error('Workspace changed. Reload to continue.');
        organizationId = page.organization.id; currentRole = page.organization.role; all.push(...page.websites); cursor = page.nextCursor;
        if (all.length > 250) { cursor = null; break; }
      } while (cursor && active);
      if (active) { setSites(all); selectedOrganization.current=organizationId??'';
        selectedSite.current=all[0]?.id ?? '';setSiteId(selectedSite.current); setRole(currentRole);
        setStatus(all.length > 250 ? 'Website list limited to the first page set.':all.length ? '' : 'No websites registered.'); }
    }
    void load().catch(error => { if (active) setStatus(error instanceof Error ? error.message : 'Website registry unavailable.'); });
    return () => { active = false; };
  }, []);
  const site = sites.find(s => s.id === siteId);
  async function preview(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!site) return;
    setBusy(true); setResult(null); setObservation(null); setStatus('');
    try {
      const candidate: Observation = { websiteId: site.id, pages: [{ url, status: Number(httpStatus), indexable: indexable === 'yes', title,
        h1Count: Number(h1Count), wordCount: Number(wordCount), internalLinks: Number(internalLinks),
        ...(description ? { description } : {}), ...(canonical ? { canonical } : {}) }] };
      const comparison = competitorUrl && competitorFeature.trim() ? { competitors: [{ evidenceUrl: competitorUrl,
        featureName: competitorFeature.trim(), plan: competitorPlan, ourAvailability }] } : {};
      const response = await fetch('/api/organization-intelligence-preview', { method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...candidate, ...comparison }) });
      if (!response.ok) throw workspaceError(response, 'Manual evidence preview');
      const previewResult = await response.json() as Result & { websiteId: string; organizationId: string };
      if (candidate.websiteId !== selectedSite.current || previewResult.websiteId !== candidate.websiteId ||
        previewResult.organizationId !== selectedOrganization.current || previewResult.evidence !== 'UNVERIFIED_MANUAL_INPUT')
        throw Error('Workspace or evidence scope changed. Preview again.');
      setResult(previewResult);
      setObservation(candidate); setRequestKey(crypto.randomUUID());setObservationTime(new Date().toISOString());
      setStatus('Unverified manual preview. No crawl, audit, recommendation, approval or publication was recorded.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Preview unavailable.'); }
    finally { setBusy(false); }
  }
  async function loadRecorded() {
    if (!siteId) return;
    const requestedSite = siteId;
    setRecordedStatus('Loading recorded observations…');
    try {
      const response = await fetch('/api/organization-intelligence-evidence?websiteId='+encodeURIComponent(requestedSite),
        { credentials:'include', cache:'no-store' });
      if (!response.ok) throw workspaceError(response,'Recorded observations');
      const data = await response.json() as { organizationId:string; websiteId:string; items: Recorded[]; verifiedEvidenceAvailable: boolean };
      if (requestedSite !== selectedSite.current || data.websiteId!==requestedSite || data.organizationId!==selectedOrganization.current ||
          data.verifiedEvidenceAvailable !== false) throw Error('Evidence scope or verification claim changed.');
      setRecorded(data.items);
      setRecordedStatus(data.items.length ? 'Recorded observations are unverified manual claims.' : 'No recorded observations.');
    } catch(error) { setRecorded(null); setRecordedStatus(error instanceof Error ? error.message : 'Recorded observations unavailable.'); }
  }
  async function mutate(method:'POST'|'PATCH',body:object) {
    if (mutationHold || busy) return;
    setBusy(true);setRecordedStatus('');
    try {
      const response = await fetch('/api/organization-intelligence-evidence',{method,credentials:'include',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if (!response.ok) {
        const error = await response.json().catch(()=>null) as {code?:string}|null;
        if (error?.code === 'EVIDENCE_OUTCOME_UNKNOWN_OPERATOR_HOLD') {
          setMutationHold(true);throw Error('Evidence transaction outcome unknown. Stop and request operator review; do not retry.');
        }
        throw workspaceError(response,'Recorded observations');
      }
      setObservation(null);setResult(null);
      await loadRecorded();
    } catch(error) {setRecordedStatus(error instanceof Error?error.message:'Evidence operation unavailable.');}
    finally {setBusy(false);}
  }
  function save() {
    if (!observation || !requestKey || !['owner','admin','editor'].includes(role)) return;
    const observedAt = observationTime;
    if (!Number.isFinite(Date.parse(observedAt))) return;
    void mutate('POST',{...observation,idempotencyKey:requestKey,sourceLabel:'Manual first-party preview',observedAt,
      expiresAt:new Date(Date.parse(observedAt)+7*86400000).toISOString()});
  }
  return <section className="panel" aria-label="Growth intelligence preview">
    <h2>Growth intelligence</h2>
    <p>Enter a page observation to preview the SEO and feature rules. Manual input is unverified and is never fetched, saved, or used to authorize work.</p>
    {status && <p role="status">{status}</p>}
    {site && <form className="registryForm" onSubmit={event => void preview(event)}>
      <div><label htmlFor="intelligence-site">Website</label><select id="intelligence-site" value={siteId} disabled={busy} onChange={event => { selectedSite.current=event.target.value;setSiteId(event.target.value); setUrl(''); setTitle(''); setDescription(''); setCanonical(''); setHttpStatus(''); setIndexable(''); setH1Count(''); setWordCount(''); setInternalLinks(''); setCompetitorUrl(''); setCompetitorFeature(''); setOurAvailability('unknown'); setResult(null); setObservation(null); setRecorded(null); setRecordedStatus(''); }}>
        {sites.map(s => <option key={s.id} value={s.id}>{s.domain}</option>)}</select></div>
      <div><label htmlFor="intelligence-url">Observed HTTPS page URL on {site.domain}</label><input id="intelligence-url" type="url" required maxLength={2048} value={url} onChange={event => {setUrl(event.target.value);setResult(null);setObservation(null);}} placeholder={'https://' + site.domain + '/'} /></div>
      <div><label htmlFor="intelligence-title">Observed page title (blank if absent)</label><input id="intelligence-title" maxLength={300} value={title} onChange={event => {setTitle(event.target.value);setResult(null);setObservation(null);}} /></div>
      <div><label htmlFor="intelligence-canonical">Observed canonical HTTPS URL (blank if absent)</label><input id="intelligence-canonical" type="url" maxLength={2048} value={canonical} onChange={event => {setCanonical(event.target.value);setResult(null);setObservation(null);}} /></div>
      <div><label htmlFor="intelligence-description">Observed meta description (blank if absent)</label><input id="intelligence-description" maxLength={1000} value={description} onChange={event => {setDescription(event.target.value);setResult(null);setObservation(null);}} /></div>
      <div><label htmlFor="intelligence-http">Observed HTTP status</label><input id="intelligence-http" type="number" min="100" max="599" required value={httpStatus} onChange={event => {setHttpStatus(event.target.value);setResult(null);setObservation(null);}} /></div>
      <div><label htmlFor="intelligence-indexable">Observed indexability</label><select id="intelligence-indexable" required value={indexable} onChange={event => {setIndexable(event.target.value);setResult(null);setObservation(null);}}><option value="">Select observed state</option><option value="yes">Indexable</option><option value="no">Not indexable</option></select></div>
      <div><label htmlFor="intelligence-h1">Observed H1 count</label><input id="intelligence-h1" type="number" min="0" max="100" required value={h1Count} onChange={event => {setH1Count(event.target.value);setResult(null);setObservation(null);}} /></div>
      <div><label htmlFor="intelligence-words">Observed word count</label><input id="intelligence-words" type="number" min="0" max="1000000" required value={wordCount} onChange={event => {setWordCount(event.target.value);setResult(null);setObservation(null);}} /></div>
      <div><label htmlFor="intelligence-links">Observed internal link count</label><input id="intelligence-links" type="number" min="0" max="1000000" required value={internalLinks} onChange={event => {setInternalLinks(event.target.value);setResult(null);setObservation(null);}} /></div>
      <fieldset className="manualComparison"><legend>Optional manually observed competitor feature</legend>
        <p>This comparison is unverified. No competitor website is fetched.</p>
        <label htmlFor="competitor-url">HTTPS source URL</label><input id="competitor-url" type="url" maxLength={2048} required={!!competitorFeature.trim()} value={competitorUrl} onChange={event=>{setCompetitorUrl(event.target.value);setResult(null);setObservation(null);}} />
        <label htmlFor="competitor-feature">Feature observed</label><input id="competitor-feature" maxLength={120} minLength={2} required={!!competitorUrl} value={competitorFeature} onChange={event=>{setCompetitorFeature(event.target.value);setResult(null);setObservation(null);}} />
        <label htmlFor="competitor-plan">Reported competitor plan</label><select id="competitor-plan" value={competitorPlan} onChange={event=>{setCompetitorPlan(event.target.value as typeof competitorPlan);setResult(null);setObservation(null);}}><option value="free">Free</option><option value="pro">Pro</option><option value="business">Business</option></select>
        <label htmlFor="our-feature">Our feature availability</label><select id="our-feature" value={ourAvailability} onChange={event=>{setOurAvailability(event.target.value as typeof ourAvailability);setResult(null);setObservation(null);}}><option value="unknown">Unknown</option><option value="absent">Manually reported absent</option><option value="present">Manually reported present</option></select>
      </fieldset>
      <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Preview manual evidence'}</button>
    </form>}
    {result && <div aria-label="Unverified intelligence results"><h3>Unverified manual preview</h3>
      <p>SEO findings: {result.seoFindings.length}. Feature candidates: {result.featureCandidates.length}.</p>
      <ul>{result.seoFindings.map((f, i) => <li key={f.key + i}>{f.severity}: {f.evidence}</li>)}</ul>
      <ul>{result.featureCandidates.map(f => <li key={f.featureKey}>{f.name} ({f.confidence} confidence from supplied text)</li>)}</ul>
      <h4>Ideas for administrative review only</h4><ul>{result.recommendations.map((r,i)=><li key={r.category+i}>{r.title}: {r.rationale} (manual source: {r.evidenceUrl})</li>)}</ul>
      {['owner','admin','editor'].includes(role) && <button type="button" disabled={busy||mutationHold||!observation}
        onClick={save}>Save unverified observation with audit</button>}
    </div>}
    {site && <div><button type="button" className="secondary" onClick={()=>void loadRecorded()}>View recorded observations</button>
      {recordedStatus&&<p role="status">{recordedStatus}</p>}
      {recorded&&<ul>{recorded.map(item=><li key={item.id}>{item.sourceLabel} · {item.state} · claimed {String(item.observedAt)} · expires {String(item.expiresAt)}
        {item.state!=='revoked'&&['owner','admin'].includes(role)&&<button type="button" disabled={busy||mutationHold}
          onClick={()=>void mutate('PATCH',{websiteId:siteId,evidenceId:item.id})}>Revoke recorded observation</button>}</li>)}</ul>}
    </div>}
  </section>;
}
