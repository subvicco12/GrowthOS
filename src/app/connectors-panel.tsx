'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import type { ConnectorState } from '../core/connector-health';
import { workspaceError } from './workspace-response';

type Connector = { websiteId: string; domain: string; platform: string; state: ConnectorState; checkedAt: string | null;
  reason: string; automationEnabled: boolean; publishingEnabled: boolean };
type Page = { organization: { id: string; role: string }; connectors: Connector[]; nextCursor: string | null };
type HistoryItem = { issuer: string; keyId: string; eventId: string; channel: string; destinationId: string;
  sequence: string; claimedObservedAt: string | null; recordedStatus: string | null; verification: 'unverified_record' };
export function ConnectorsPanel() {
  const [entries, setEntries] = useState<Connector[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('Loading connector evidence…');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('viewer');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [historySite, setHistorySite] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyMessage, setHistoryMessage] = useState('');
  const [currentHealth, setCurrentHealth] = useState<Record<string,string>>({});
  async function fetchPage(next?: string): Promise<Page> {
    const response = await fetch('/api/organization-connectors' + (next ? '?cursor=' + encodeURIComponent(next) : ''), { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw workspaceError(response, 'Connector evidence');
    return response.json() as Promise<Page>;
  }
  useEffect(() => { let active = true; void fetchPage().then(page => { if (active) { setEntries(page.connectors); setCursor(page.nextCursor);
      setRole(page.organization.role); setOrganizationId(page.organization.id); setMessage(''); } })
    .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Connector evidence unavailable.'); });
    return () => { active = false; }; }, []);
  async function more() { if (!cursor || busy) return; setBusy(true); setMessage('');
    try { const page = await fetchPage(cursor); if (page.organization.id!==organizationId) throw Error('Workspace changed. Refresh the page.');
      setEntries(old => { const known = new Set(old.map(entry => entry.websiteId)); return [...old, ...page.connectors.filter(entry => !known.has(entry.websiteId))]; }); setCursor(page.nextCursor); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Connector evidence unavailable.'); }
    finally { setBusy(false); }
  }
  async function disable(websiteId: string, feature: 'automation'|'auto_publish') {
    setMessage('');
    try { const response=await fetch('/api/website-features',{method:'PATCH',credentials:'include',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({websiteId,feature,enabled:false})});
      if(!response.ok)throw workspaceError(response,'Website control');
      setEntries(items=>items.map(item=>item.websiteId===websiteId?{...item,
        automationEnabled:feature==='automation'?false:item.automationEnabled,
        publishingEnabled:feature==='auto_publish'?false:item.publishingEnabled}:item));
      setMessage('Website control disabled. No connector or publication was activated.');
    }catch(error){setMessage(error instanceof Error?error.message:'Website control unavailable.');}
  }
  async function showHistory(websiteId:string){
    if(historySite===websiteId){setHistorySite(null);setHistory(null);return;}
    setHistorySite(websiteId);setHistory(null);setCurrentHealth({});setHistoryMessage('Loading recorded connector history…');
    try{const response=await fetch('/api/organization-connector-history?websiteId='+encodeURIComponent(websiteId),
      {credentials:'include',cache:'no-store'});
      if(!response.ok)throw workspaceError(response,'Connector history');
      const data=await response.json() as {websiteId:string;items:HistoryItem[]};
      if(data.websiteId!==websiteId)throw Error('Connector history scope changed.');
      setHistory(data.items);setHistoryMessage(data.items.length?'Recorded history is not independently verified health.':'No recorded connector observations.');
    }catch(error){setHistoryMessage(error instanceof Error?error.message:'Connector history unavailable.');}
  }
  async function verifyCurrent(websiteId:string,item:HistoryItem){
    const key=item.channel+':'+item.destinationId;
    setCurrentHealth(old=>({...old,[key]:'Checking current trust…'}));
    try{const params=new URLSearchParams({websiteId,channel:item.channel,destinationId:item.destinationId});
      const response=await fetch('/api/organization-connector-health?'+params,{credentials:'include',cache:'no-store'});
      if(!response.ok)throw workspaceError(response,'Connector health');
      const result=await response.json() as {state:ConnectorState;reason:string};
      setCurrentHealth(old=>({...old,[key]:result.state+' · '+result.reason}));
    }catch(error){setCurrentHealth(old=>({...old,[key]:error instanceof Error?error.message:'Connector health unavailable.'}));}
  }
  return <section className="panel"><h2>Connector health</h2><p>A platform setting is not a health check. Unknown means no independently verified result. Recorded history is unverified until its signature and independent anchor are checked. Owners and admins may turn off website publishing or automation; connector activation is unavailable.</p>
    {message && <p role="status">{message}</p>}
    <div className="portfolioGrid">{entries.map(entry => <article className="portfolioItem" key={entry.websiteId}><strong>{entry.domain}</strong><span>{entry.platform} · {entry.state}</span><small>{entry.reason === 'NO_PERSISTED_HEALTH_CHECK' ? 'No independently verified health check available' : entry.reason}</small>
      {['owner','admin'].includes(role)&&<div className="websiteControls">
        <button type="button" className="secondary" aria-expanded={historySite===entry.websiteId} onClick={()=>void showHistory(entry.websiteId)}>{historySite===entry.websiteId?'Hide recorded history':'View recorded history'}</button>
        {entry.publishingEnabled&&<button type="button" onClick={()=>void disable(entry.websiteId,'auto_publish')}>Disable website publishing</button>}
        {entry.automationEnabled&&<button type="button" onClick={()=>void disable(entry.websiteId,'automation')}>Disable website automation</button>}
      </div>}
      {historySite===entry.websiteId&&<div><p role="status">{historyMessage}</p>
        {history&&<ul>{history.map(item=><li key={item.issuer+':'+item.keyId+':'+item.eventId}>
          {item.channel} · {item.recordedStatus??'unknown'} (recorded, unverified) · claimed time {item.claimedObservedAt??'unavailable'} · sequence {item.sequence}
          <button type="button" className="secondary" onClick={()=>void verifyCurrent(entry.websiteId,item)}>Check current trust</button>
          {currentHealth[item.channel+':'+item.destinationId]&&<span role="status">{currentHealth[item.channel+':'+item.destinationId]}</span>}
        </li>)}</ul>}</div>}
    </article>)}</div>
    {!entries.length && !message && <p>No registered websites in this workspace.</p>}
    {cursor && <button className="secondary" type="button" disabled={busy} onClick={() => void more()}>{busy ? 'Loading…' : 'Load more connectors'}</button>}
  </section>;
}
