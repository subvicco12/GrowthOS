'use client';
import { useEffect, useRef, useState } from 'react';
import {useScopedWebsitePager} from './use-scoped-website-pager';
import { workspaceError } from './workspace-response';
import { LocalOnboardingProfile } from './local-onboarding-profile';
import {emptyOnboardingProfile,type OnboardingProfile} from '../core/local-onboarding-profile';
import type {WebsiteSummary} from '../core/workspace-journey';

export function OrganizationWebsiteRegistry({preferredWebsiteId,onWebsiteChange}:{preferredWebsiteId?:string;onWebsiteChange?:(id:string,site:WebsiteSummary,organizationId:string)=>boolean}={}) {
  const {state:pages,pager}=useScopedWebsitePager(true,'Website registry');
  const data=pages.scope&&pages.organization?{organization:{id:pages.organization.id,name:pages.organization.name??'Organization',role:pages.organization.role??''},websites:pages.scope.websites}:null;
  const [message, setMessage] = useState('');
  const [filter,setFilter]=useState('');
  const [refreshNeeded,setRefreshNeeded]=useState(false);
  const [domain, setDomain] = useState('');
  const [platform, setPlatform] = useState<'wordpress'|'nextjs'|'react'|'static'|'custom'>('wordpress');
  const [submitting, setSubmitting] = useState(false);
  const [mutating,setMutating]=useState(false);
  const mutationLock=useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [profiles,setProfiles]=useState<Record<string,OnboardingProfile>>({});
  useEffect(()=>{if(pages.fatal){setSelected(null);setProfiles({});}},[pages.fatal]);
  useEffect(()=>{if(preferredWebsiteId&&data?.websites.some(site=>site.id===preferredWebsiteId))setSelected(preferredWebsiteId);},[preferredWebsiteId,data?.websites]);
  async function disableFeature(websiteId: string, feature: 'automation' | 'auto_publish') {
    if (!data || pages.busy || mutationLock.current || !['owner','admin'].includes(data.organization.role) || !data.websites.some(site=>site.id===websiteId)) return;
    mutationLock.current=true;setMutating(true);
    setMessage('');
    try {
      const response = await fetch('/api/website-features', {
        method: 'PATCH', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteId, feature, enabled: false })
      });
      if (!response.ok) {if(response.status===401||response.status===403)pager.failClosed();throw workspaceError(response, 'Feature change');}
      const confirmed=await response.json() as {websiteId:string;feature:string;enabled:boolean};
      if(confirmed.websiteId!==websiteId||confirmed.feature!==feature||confirmed.enabled!==false){pager.failClosed();throw Error('Feature response could not be verified.');}
      if(!pager.updateSite(websiteId,site=>({...site,[feature==='automation'?'automationEnabled':'autoPublishEnabled']:false})))throw Error('Website scope changed. Reload before continuing.');
      setMessage('Feature disabled. No operation was started.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Feature change failed.'); }
    finally {mutationLock.current=false;setMutating(false);}
  }
  async function register(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || pages.busy || mutationLock.current || !['owner','admin'].includes(data.organization.role)) return;
    mutationLock.current=true;setMutating(true);
    const expectedOrganization = data.organization.id;
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/organization-websites', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: expectedOrganization, domain, platform })
      });
      if (!response.ok) {if(response.status===401||response.status===403)pager.failClosed();throw response.status === 409 ? Error('This website is already registered.') : workspaceError(response, 'Registration');}
      const created=await response.json() as {website:{id:string;domain:string;status:string}};
      if(created.website?.domain!==domain||created.website.status!=='draft'){pager.failClosed();throw Error('Registration response could not be verified.');}
      setDomain('');
      const refreshed=await pager.refresh();setRefreshNeeded(!refreshed);
      setMessage(refreshed?'Website registered as draft. Verification and automation remain disabled.':'Website registration succeeded, but the registry refresh failed. Retry the page without resubmitting.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Registration failed.'); }
    finally { setSubmitting(false);mutationLock.current=false;setMutating(false); }
  }
  return <section className="panel" aria-label="Organization website registry">
    <h2>Websites and onboarding</h2>
    <p>Registration creates a draft with zero budget and both feature switches off. Ownership verification and connector setup are unavailable.</p>
    {(message||pages.error||pages.busy)&&<p role="status">{message||pages.error||'Loading website registry…'}</p>}
    {pages.error&&!pages.fatal&&<button type="button" className="secondary" disabled={pages.busy||mutating} onClick={()=>void(refreshNeeded?pager.refresh().then(ok=>{if(ok)setRefreshNeeded(false);}):pages.scope?pager.loadMore():pager.loadInitial())}>{refreshNeeded?'Retry registry refresh':'Retry website page'}</button>}
    {data && ['owner','admin'].includes(data.organization.role) && <form className="registryForm" onSubmit={event => void register(event)}>
      <div><label htmlFor="register-domain">Domain</label>
      <input id="register-domain" value={domain} onChange={event => setDomain(event.target.value)} placeholder="example.com" required maxLength={253} /></div>
      <div><label htmlFor="register-platform">Platform</label>
      <select id="register-platform" value={platform} onChange={event => setPlatform(event.target.value as typeof platform)}>
        <option value="wordpress">WordPress</option><option value="nextjs">Next.js</option>
        <option value="react">React</option><option value="static">Static</option><option value="custom">Custom</option>
      </select></div>
      <button type="submit" disabled={submitting||pages.busy||mutating}>{submitting ? 'Registering…' : 'Add draft website'}</button>
    </form>}
    {data && <><p>{data.organization.name} · {data.organization.role} · {data.websites.length} websites loaded{pages.nextCursor ? ' (more available)' : ''}</p>
      <label className="registryFilter">Filter loaded websites<input type="search" value={filter} maxLength={253} onChange={e=>setFilter(e.target.value)} placeholder="Filter websites already loaded" /></label>
      <small>Filtering does not search unloaded websites.</small>
      <div className="siteRows">
        {data.websites.filter(site=>site.domain.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())).map(site => <article className="siteRow" key={site.id}>
          <div className="siteRowMain"><strong>{site.domain}</strong>
            <span>{site.platform} · {site.status} · Automation {site.automationEnabled ? 'enabled' : 'disabled'} · Publishing {site.autoPublishEnabled ? 'enabled' : 'disabled'}</span>
          </div>
          <button type="button" className="secondary" aria-expanded={selected===site.id} onClick={()=>{if(selected!==site.id&&onWebsiteChange?.(site.id,site,data.organization.id)===false)return;setSelected(selected===site.id?null:site.id);}}>{selected===site.id?'Hide settings':'View settings'}</button>
          {selected===site.id&&<div className="websiteDetail"><h3>Onboarding and settings</h3><ol><li>Draft registration: {site.status === 'draft' ? 'current' : 'recorded'}</li><li>Ownership verification: {site.verifiedAt ? 'recorded' : 'not verified'}</li><li>Connector health: unknown until a persisted check is available</li><li>Activation: unavailable from this workspace</li></ol><p>Platform: {site.platform}. Lifecycle: {site.status}. Configured monthly website budget: {site.monthlyBudgetMinor} minor units; currency and actual spend are unavailable.</p>
            <p>Automation: {site.automationEnabled?'enabled':'disabled'}. Auto-publish: {site.autoPublishEnabled?'enabled':'disabled'}. Activation and budget changes are unavailable.</p>
            <LocalOnboardingProfile organizationId={data.organization.id} site={site} canEdit={['owner','admin','editor'].includes(data.organization.role)} profile={profiles[site.id]??emptyOnboardingProfile({organizationId:data.organization.id,websiteId:site.id,domain:site.domain})} onChange={next=>setProfiles(old=>({...old,[site.id]:next}))}/>
            {['owner','admin'].includes(data.organization.role)&&<div className="websiteControls">
              {site.automationEnabled&&<button type="button" disabled={pages.busy||mutating} onClick={()=>void disableFeature(site.id,'automation')}>Disable automation</button>}
              {site.autoPublishEnabled&&<button type="button" disabled={pages.busy||mutating} onClick={()=>void disableFeature(site.id,'auto_publish')}>Disable publishing</button>}
            </div>}</div>}
        </article>)}
        {!data.websites.length && <p>No websites registered in this workspace.</p>}
        {data.websites.length>0&&!data.websites.some(site=>site.domain.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))&&<p>No matching websites among loaded pages.</p>}
      </div>
      {pages.nextCursor&&!pages.error&&<button type="button" className="secondary" disabled={pages.busy||mutating} onClick={()=>void pager.loadMore()}>{pages.busy?'Loading…':'Load more websites'}</button>}
    </>}
  </section>;
}
