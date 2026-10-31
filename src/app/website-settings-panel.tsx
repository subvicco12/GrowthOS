'use client';
import { useEffect, useRef, useState } from 'react';
import { readWebsiteSettingsPage, readWebsiteSettingsResponse, websiteTimezoneSchema,
  type WebsiteSettings, type WebsiteSettingsPatch, type ShutdownEvent } from '../core/website-settings';
import { workspaceError } from './workspace-response';

type Props = { organizationId: string; websiteId: string; role: string; disabled?: boolean; onAccessDenied: () => void };
export function WebsiteSettingsPanel({ organizationId, websiteId, role, disabled, onAccessDenied }: Props) {
  const [site, setSite] = useState<WebsiteSettings | null>(null);
  const [platform, setPlatform] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [history, setHistory] = useState<ShutdownEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading persisted settings…');
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);
  const lock = useRef(false);
  const accessDenied = useRef(onAccessDenied); accessDenied.current = onAccessDenied;
  const canEdit = ['owner', 'admin'].includes(role);

  function apply(next: WebsiteSettings) { setSite(next); setPlatform(next.platform); setTimezone(next.timezone); }
  async function check(response: Response) {
    if (response.status === 401 || response.status === 403) { setSite(null); setHistory([]); accessDenied.current(); }
    if (!response.ok) {
      if (response.status === 409) throw Error('Settings changed or this transition is no longer allowed. Reload settings before trying again.');
      if (response.status === 404) { setSite(null); setHistory([]); throw Error('Website is no longer available in this workspace.'); }
      if (response.status === 400) throw Error('Settings were rejected. Check the timezone and try again.');
      if (response.status >= 500) throw Error('Save or load outcome unavailable. Reload settings before retrying a change.');
      throw workspaceError(response, 'Website settings');
    }
  }
  async function load(nextCursor?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(); request.current = controller;
    try {
      const query = new URLSearchParams({ organizationId, websiteId, ...(nextCursor ? { cursor: nextCursor } : {}) });
      const response = await fetch('/api/website-settings?' + query, { credentials: 'include', cache: 'no-store', signal: controller.signal });
      if (!active.current || controller.signal.aborted) return;
      await check(response);
      const page = readWebsiteSettingsPage(await response.json(), organizationId, websiteId);
      if (!active.current || controller.signal.aborted) return;
      if (!nextCursor) apply(page.website);
      setHistory(old => nextCursor ? [...old, ...page.history.filter(entry => !old.some(item => item.id === entry.id))] : page.history);
      if (page.nextCursor === nextCursor) throw Error('History pagination could not be verified. Reload settings.');
      setCursor(page.nextCursor);
    } catch (error) {
      if (active.current && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Settings unavailable.');
    } finally { if (active.current && !controller.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => {
    active.current = true; lock.current = false; setSite(null); setHistory([]); setCursor(null);
    void load();
    return () => { active.current = false; request.current?.abort(); };
    // The registry keys this panel by organization and website, discarding old drafts on scope changes.
  }, [organizationId, websiteId]);

  async function save(change: { action: 'metadata'; platform: string; timezone: string } | { action: 'lifecycle'; status: 'paused' | 'archived' | 'draft' }) {
    if (!site || !canEdit || disabled || lock.current) return;
    if (change.action === 'metadata' && !websiteTimezoneSchema.safeParse(change.timezone).success) { setMessage('Enter a valid IANA timezone, such as UTC or Europe/London.'); return; }
    if (change.action === 'lifecycle' && !window.confirm(`Set ${site.domain} to ${change.status}? Automation and publishing will be disabled. Running external work is not cancelled by this control.`)) return;
    lock.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(); request.current = controller;
    try {
      const body = { ...change, organizationId, websiteId, expectedState: site.stateToken } as WebsiteSettingsPatch;
      const response = await fetch('/api/website-settings', { method: 'PATCH', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (!active.current || controller.signal.aborted) return;
      await check(response);
      const confirmed = readWebsiteSettingsResponse(await response.json(), organizationId, websiteId);
      if (!active.current || controller.signal.aborted) return;
      apply(confirmed);
      window.dispatchEvent(new CustomEvent('growthos-website-updated', { detail: { organizationId, website: confirmed } }));
      // Refresh the history after a lifecycle shutdown; a failure here must not invite resubmitting the mutation.
      setMessage('Changes saved to the database. Reload settings to refresh shutdown history.');
    } catch (error) {
      if (active.current && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Save outcome unavailable. Reload settings before retrying.');
    } finally { if (active.current && !controller.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  return <section aria-label="Persisted website settings" className="panel">
    <h4>Saved website configuration</h4>
    <p>Domain and ownership cannot be changed here. Metadata is editable only for unverified drafts. Settings never activate automation or publishing.</p>
    {message && <p role="status">{message}</p>}
    <button type="button" className="secondary" disabled={busy || disabled} onClick={() => void load()}>Reload settings and history</button>
    {site && <>
      <p>Lifecycle: <strong>{site.status}</strong> · Timezone: {site.timezone} · Platform: {site.platform}</p>
      <form className="registryForm" onSubmit={event => { event.preventDefault(); void save({ action: 'metadata', platform, timezone }); }}>
        <div><label htmlFor={`settings-platform-${websiteId}`}>Website platform</label>
          <select id={`settings-platform-${websiteId}`} value={platform} onChange={event => setPlatform(event.target.value)} disabled={!canEdit || site.status !== 'draft' || !!site.verifiedAt || busy || disabled}>
            <option value="wordpress">WordPress</option><option value="nextjs">Next.js</option><option value="react">React</option><option value="static">Static</option><option value="custom">Custom</option>
          </select></div>
        <div><label htmlFor={`settings-timezone-${websiteId}`}>IANA timezone</label>
          <input id={`settings-timezone-${websiteId}`} value={timezone} onChange={event => setTimezone(event.target.value)} maxLength={80} required disabled={!canEdit || site.status !== 'draft' || !!site.verifiedAt || busy || disabled}/></div>
        {canEdit && <button type="submit" disabled={site.status !== 'draft' || !!site.verifiedAt || busy || disabled}>Save configuration</button>}
      </form>
      {canEdit && <div className="websiteControls" aria-label="Website lifecycle controls">
        {!['paused', 'archived'].includes(site.status) && <button type="button" disabled={busy || disabled} onClick={() => void save({ action: 'lifecycle', status: 'paused' })}>Pause website</button>}
        {site.status !== 'archived' && <button type="button" className="secondary" disabled={busy || disabled} onClick={() => void save({ action: 'lifecycle', status: 'archived' })}>Archive website</button>}
        {['paused', 'archived'].includes(site.status) && <button type="button" className="secondary" disabled={busy || disabled} onClick={() => void save({ action: 'lifecycle', status: 'draft' })}>Return to draft</button>}
      </div>}
      <h4>Feature shutdown history</h4>
      <p>This append-only history records feature switches turned off. It does not record metadata edits or every lifecycle change.</p>
      {!history.length && <p>No shutdown events loaded for this website.</p>}
      <ul>{history.map(entry => <li key={entry.id}>{entry.feature === 'automation' ? 'Automation' : 'Publishing'} disabled · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time> · Actor {entry.actorId}</li>)}</ul>
      {cursor && <button type="button" className="secondary" disabled={busy || disabled} onClick={() => void load(cursor)}>Load older website events</button>}
    </>}
  </section>;
}
