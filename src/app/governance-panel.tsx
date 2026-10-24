'use client';
import { useEffect, useState } from 'react';
import { workspaceError } from './workspace-response';

type Entry = { id: string; website_id: string; actor_id: string; created_at: string; feature?: string; decision?: string };
type Stream = 'features' | 'decisions';
type Page = { items: Entry[]; nextCursor: string | null };

function HistoryStream({ stream, title }: { stream: Stream; title: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('Loading history…');
  const [busy, setBusy] = useState(false);
  async function fetchPage(cursor?: string): Promise<Page> {
    const url = '/api/organization-governance?stream=' + stream + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw workspaceError(response, title);
    return response.json() as Promise<Page>;
  }
  useEffect(() => { let active = true;
    void fetchPage().then(page => { if (active) { setEntries(page.items); setNextCursor(page.nextCursor); setMessage(''); } })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'History unavailable.'); });
    return () => { active = false; };
  }, [stream]);
  async function more() { if (!nextCursor || busy) return;
    setBusy(true); setMessage('');
    try { const page = await fetchPage(nextCursor); setEntries(old => { const known = new Set(old.map(entry => entry.id)); return [...old, ...page.items.filter(entry => !known.has(entry.id))]; }); setNextCursor(page.nextCursor); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'History unavailable.'); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label={title}><h3>{title}</h3>{message && <p role="status">{message}</p>}
    <div className="auditList">{entries.map(item => <article key={item.id} className="auditEntry">
      <strong>{stream === 'features' ? item.feature + ' disabled' : item.decision}</strong>
      <span>Website {item.website_id} · {new Date(item.created_at).toLocaleString()}</span>
    </article>)}</div>
    {!entries.length && !message && <p>No records in this view.</p>}
    {nextCursor && <button type="button" className="secondary" disabled={busy} onClick={() => void more()}>{busy ? 'Loading…' : 'Load older records'}</button>}
  </section>;
}

export function GovernancePanel() { return <section className="pageStack" aria-label="Governance">
  <div className="panel"><h2>Governance and audit</h2><p>Read-only internal decision and feature shutdown history. Other activity is not represented by these tables.</p></div>
  <HistoryStream stream="features" title="Feature shutdowns"/>
  <HistoryStream stream="decisions" title="Internal decisions"/>
</section>; }
