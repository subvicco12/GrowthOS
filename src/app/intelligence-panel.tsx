'use client';
import { useEffect, useState } from 'react';
import { workspaceError } from './workspace-response';

type Site = { id: string; domain: string };
type Page = { websites: Site[]; nextCursor: string | null; organization: { id: string } };
type Result = { evidence: 'UNVERIFIED_MANUAL_INPUT'; seoFindings: { key: string; severity: string; evidence: string }[];
  featureCandidates: { featureKey: string; name: string; confidence: string }[] };

export function IntelligencePanel() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('Loading websites…');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      const all: Site[] = []; let cursor: string | null = null; let organizationId: string | null = null;
      do {
        const response = await fetch('/api/organization-websites' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw workspaceError(response, 'Website registry');
        const page = await response.json() as Page;
        if (organizationId && organizationId !== page.organization.id) throw Error('Workspace changed. Reload to continue.');
        organizationId = page.organization.id; all.push(...page.websites); cursor = page.nextCursor;
        if (all.length > 250) { cursor = null; setStatus('Website list limited to 250 entries.'); }
      } while (cursor && active);
      if (active) { setSites(all); setSiteId(all[0]?.id ?? ''); setStatus(all.length ? '' : 'No websites registered.'); }
    }
    void load().catch(error => { if (active) setStatus(error instanceof Error ? error.message : 'Website registry unavailable.'); });
    return () => { active = false; };
  }, []);
  const site = sites.find(s => s.id === siteId);
  async function preview(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!site) return;
    setBusy(true); setResult(null); setStatus('');
    try {
      const response = await fetch('/api/organization-intelligence-preview', { method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ websiteId: site.id, pages: [{ url, status: 200, indexable: true, title,
          h1Count: 1, wordCount: 0, internalLinks: 0 }] }) });
      if (!response.ok) throw workspaceError(response, 'Manual evidence preview');
      setResult(await response.json() as Result);
      setStatus('Unverified manual preview. No crawl, audit, recommendation, approval or publication was recorded.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Preview unavailable.'); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Growth intelligence preview">
    <h2>Growth intelligence</h2>
    <p>Enter a page observation to preview the SEO and feature rules. Manual input is unverified and is never fetched, saved, or used to authorize work.</p>
    {status && <p role="status">{status}</p>}
    {site && <form className="registryForm" onSubmit={event => void preview(event)}>
      <div><label htmlFor="intelligence-site">Website</label><select id="intelligence-site" value={siteId} onChange={event => { setSiteId(event.target.value); setUrl(''); setResult(null); }}>
        {sites.map(s => <option key={s.id} value={s.id}>{s.domain}</option>)}</select></div>
      <div><label htmlFor="intelligence-url">Observed HTTPS page URL on {site.domain}</label><input id="intelligence-url" type="url" required maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} placeholder={'https://' + site.domain + '/'} /></div>
      <div><label htmlFor="intelligence-title">Observed page title</label><input id="intelligence-title" maxLength={300} value={title} onChange={event => setTitle(event.target.value)} /></div>
      <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Preview manual evidence'}</button>
    </form>}
    {result && <div aria-label="Unverified intelligence results"><h3>Unverified manual preview</h3>
      <p>SEO findings: {result.seoFindings.length}. Feature candidates: {result.featureCandidates.length}.</p>
      <ul>{result.seoFindings.map((f, i) => <li key={f.key + i}>{f.severity}: {f.evidence}</li>)}</ul>
      <ul>{result.featureCandidates.map(f => <li key={f.featureKey}>{f.name} ({f.confidence} confidence from supplied text)</li>)}</ul>
    </div>}
  </section>;
}
