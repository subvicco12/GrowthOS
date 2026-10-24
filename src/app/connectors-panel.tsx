'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import type { ConnectorState } from '../core/connector-health';
import { workspaceError } from './workspace-response';

type Connector = { websiteId: string; domain: string; platform: string; state: ConnectorState; checkedAt: string | null; reason: string };
type Page = { connectors: Connector[]; nextCursor: string | null };
export function ConnectorsPanel() {
  const [entries, setEntries] = useState<Connector[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('Loading connector evidence…');
  const [busy, setBusy] = useState(false);
  async function fetchPage(next?: string): Promise<Page> {
    const response = await fetch('/api/organization-connectors' + (next ? '?cursor=' + encodeURIComponent(next) : ''), { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw workspaceError(response, 'Connector evidence');
    return response.json() as Promise<Page>;
  }
  useEffect(() => { let active = true; void fetchPage().then(page => { if (active) { setEntries(page.connectors); setCursor(page.nextCursor); setMessage(''); } })
    .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Connector evidence unavailable.'); });
    return () => { active = false; }; }, []);
  async function more() { if (!cursor || busy) return; setBusy(true); setMessage('');
    try { const page = await fetchPage(cursor); setEntries(old => { const known = new Set(old.map(entry => entry.websiteId)); return [...old, ...page.connectors.filter(entry => !known.has(entry.websiteId))]; }); setCursor(page.nextCursor); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Connector evidence unavailable.'); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Connector health</h2><p>A platform setting is not a health check. Unknown means no persisted probe result; disconnected requires explicit evidence; unavailable means the read failed. No changes can be made here.</p>
    {message && <p role="status">{message}</p>}
    <div className="portfolioGrid">{entries.map(entry => <article className="portfolioItem" key={entry.websiteId}><strong>{entry.domain}</strong><span>{entry.platform} · {entry.state}</span><small>{entry.reason === 'NO_PERSISTED_HEALTH_CHECK' ? 'No persisted health check available' : entry.reason}</small></article>)}</div>
    {!entries.length && !message && <p>No registered websites in this workspace.</p>}
    {cursor && <button className="secondary" type="button" disabled={busy} onClick={() => void more()}>{busy ? 'Loading…' : 'Load more connectors'}</button>}
  </section>;
}
