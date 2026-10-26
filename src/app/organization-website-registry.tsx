'use client';
import { useEffect, useState } from 'react';
import { workspaceError } from './workspace-response';
import { LocalOnboardingProfile } from './local-onboarding-profile';
import {emptyOnboardingProfile,type OnboardingProfile} from '../core/local-onboarding-profile';

type Website = {
  id: string; domain: string; platform: string; status: string;
  automationEnabled: boolean; autoPublishEnabled: boolean; monthlyBudgetMinor: string;
  verifiedAt: string | null;
};
type Payload = { organization: { id: string; name: string; role: string }; websites: Website[]; nextCursor: string | null };

export function OrganizationWebsiteRegistry({preferredWebsiteId,onWebsiteChange}:{preferredWebsiteId?:string;onWebsiteChange?:(id:string)=>boolean}={}) {
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState('Loading organization websites…');
  const [domain, setDomain] = useState('');
  const [platform, setPlatform] = useState<'wordpress'|'nextjs'|'react'|'static'|'custom'>('wordpress');
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [profiles,setProfiles]=useState<Record<string,OnboardingProfile>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  async function getPage(cursor?: string): Promise<Payload> {
    const response = await fetch('/api/organization-websites' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw workspaceError(response, 'Website registry');
    return response.json() as Promise<Payload>;
  }
  async function loadMore() { if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setMessage('');
    try { const result = await getPage(nextCursor);
      if (data && result.organization.id !== data.organization.id) throw Error('Workspace changed. Refresh the page.');
      setData(previous => {
        if (!previous) return result;
        if (previous.organization.id !== result.organization.id) return previous;
        const known = new Set(previous.websites.map(site => site.id));
        return { ...previous, websites: [...previous.websites, ...result.websites.filter(site => !known.has(site.id))] };
      });
      setNextCursor(result.nextCursor);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Website registry unavailable.'); }
    finally { setLoadingMore(false); }
  }
  useEffect(() => {
    let active = true;
    getPage().then(result => { if (active) { setData(result); setNextCursor(result.nextCursor);if(preferredWebsiteId&&result.websites.some(site=>site.id===preferredWebsiteId))setSelected(preferredWebsiteId);setMessage(''); } })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Website registry unavailable.'); });
    return () => { active = false; };
  }, []);
  async function disableFeature(websiteId: string, feature: 'automation' | 'auto_publish') {
    if (!data || !['owner','admin'].includes(data.organization.role) || !data.websites.some(site=>site.id===websiteId)) return;
    const expectedOrganization = data.organization.id;
    setMessage('');
    try {
      const response = await fetch('/api/website-features', {
        method: 'PATCH', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteId, feature, enabled: false })
      });
      if (!response.ok) throw workspaceError(response, 'Feature change');
      const refreshed = await getPage();
      if (refreshed.organization.id !== expectedOrganization) { setData(null); throw Error('Workspace changed. Reload before continuing.'); }
      setData(refreshed); setNextCursor(refreshed.nextCursor);
      setMessage('Feature disabled. No operation was started.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Feature change failed.'); }
  }
  async function register(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !['owner','admin'].includes(data.organization.role)) return;
    const expectedOrganization = data.organization.id;
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/organization-websites', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: expectedOrganization, domain, platform })
      });
      if (!response.ok) throw response.status === 409 ? Error('This website is already registered.') : workspaceError(response, 'Registration');
      const refreshed = await getPage();
      if (refreshed.organization.id !== expectedOrganization) { setData(null); throw Error('Workspace changed. Reload before continuing.'); }
      setData(refreshed); setNextCursor(refreshed.nextCursor);
      setDomain('');
      setMessage('Website registered as draft. Verification and automation remain disabled.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Registration failed.'); }
    finally { setSubmitting(false); }
  }
  return <section className="panel" aria-label="Organization website registry">
    <h2>Websites and onboarding</h2>
    <p>Registration creates a draft with zero budget and both feature switches off. Ownership verification and connector setup are unavailable.</p>
    {message && <p role="status">{message}</p>}
    {data && ['owner','admin'].includes(data.organization.role) && <form className="registryForm" onSubmit={event => void register(event)}>
      <div><label htmlFor="register-domain">Domain</label>
      <input id="register-domain" value={domain} onChange={event => setDomain(event.target.value)} placeholder="example.com" required maxLength={253} /></div>
      <div><label htmlFor="register-platform">Platform</label>
      <select id="register-platform" value={platform} onChange={event => setPlatform(event.target.value as typeof platform)}>
        <option value="wordpress">WordPress</option><option value="nextjs">Next.js</option>
        <option value="react">React</option><option value="static">Static</option><option value="custom">Custom</option>
      </select></div>
      <button type="submit" disabled={submitting}>{submitting ? 'Registering…' : 'Add draft website'}</button>
    </form>}
    {data && <><p>{data.organization.name} · {data.organization.role} · {data.websites.length} websites shown{nextCursor ? ' (more available)' : ''}</p>
      <div className="siteRows">
        {data.websites.map(site => <article className="siteRow" key={site.id}>
          <div className="siteRowMain"><strong>{site.domain}</strong>
            <span>{site.platform} · {site.status} · Automation {site.automationEnabled ? 'enabled' : 'disabled'} · Publishing {site.autoPublishEnabled ? 'enabled' : 'disabled'}</span>
          </div>
          <button type="button" className="secondary" aria-expanded={selected===site.id} onClick={()=>{if(selected!==site.id&&onWebsiteChange?.(site.id)===false)return;setSelected(selected===site.id?null:site.id);}}>{selected===site.id?'Hide settings':'View settings'}</button>
          {selected===site.id&&<div className="websiteDetail"><h3>Onboarding and settings</h3><ol><li>Draft registration: {site.status === 'draft' ? 'current' : 'recorded'}</li><li>Ownership verification: {site.verifiedAt ? 'recorded' : 'not verified'}</li><li>Connector health: unknown until a persisted check is available</li><li>Activation: unavailable from this workspace</li></ol><p>Platform: {site.platform}. Lifecycle: {site.status}. Configured monthly website budget: {site.monthlyBudgetMinor} minor units; currency and actual spend are unavailable.</p>
            <p>Automation: {site.automationEnabled?'enabled':'disabled'}. Auto-publish: {site.autoPublishEnabled?'enabled':'disabled'}. Activation and budget changes are unavailable.</p>
            <LocalOnboardingProfile organizationId={data.organization.id} site={site} canEdit={['owner','admin','editor'].includes(data.organization.role)} profile={profiles[site.id]??emptyOnboardingProfile({organizationId:data.organization.id,websiteId:site.id,domain:site.domain})} onChange={next=>setProfiles(old=>({...old,[site.id]:next}))}/>
            {['owner','admin'].includes(data.organization.role)&&<div className="websiteControls">
              {site.automationEnabled&&<button type="button" onClick={()=>void disableFeature(site.id,'automation')}>Disable automation</button>}
              {site.autoPublishEnabled&&<button type="button" onClick={()=>void disableFeature(site.id,'auto_publish')}>Disable publishing</button>}
            </div>}</div>}
        </article>)}
        {!data.websites.length && <p>No websites registered in this workspace.</p>}
      </div>
      {nextCursor&&<button type="button" className="secondary" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?'Loading…':'Load more websites'}</button>}
    </>}
  </section>;
}
