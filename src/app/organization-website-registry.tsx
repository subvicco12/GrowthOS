'use client';
import { useEffect, useState } from 'react';

type Website = {
  id: string; domain: string; platform: string; status: string;
  automationEnabled: boolean; autoPublishEnabled: boolean; monthlyBudgetMinor: string;
};
type Payload = { organization: { id: string; name: string; role: string }; websites: Website[] };

export function OrganizationWebsiteRegistry() {
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState('Loading organization websites…');
  const [domain, setDomain] = useState('');
  const [platform, setPlatform] = useState<'wordpress'|'nextjs'|'react'|'static'|'custom'>('wordpress');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/organization-websites', { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in required.' : response.status === 403 ? 'Select an authorized workspace.' : 'Website registry unavailable.');
        return response.json() as Promise<Payload>;
      })
      .then(result => { if (active) { setData(result); setMessage(''); } })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Website registry unavailable.'); });
    return () => { active = false; };
  }, []);
  async function disableFeature(websiteId: string, feature: 'automation' | 'auto_publish') {
    setMessage('');
    try {
      const response = await fetch('/api/website-features', {
        method: 'PATCH', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteId, feature, enabled: false })
      });
      if (!response.ok) throw new Error('Feature disable request failed.');
      const refreshed = await fetch('/api/organization-websites', { credentials: 'include', cache: 'no-store' });
      if (!refreshed.ok) throw new Error('Feature disabled, but refresh failed.');
      setData(await refreshed.json() as Payload);
      setMessage('Feature disabled. No operation was started.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Feature change failed.'); }
  }
  async function register(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/organization-websites', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, platform })
      });
      if (!response.ok) throw new Error(response.status === 409 ? 'This website is already registered.' : response.status === 403 ? 'Your role cannot register websites.' : 'Registration failed.');
      const refreshed = await fetch('/api/organization-websites', { credentials: 'include', cache: 'no-store' });
      if (!refreshed.ok) throw new Error('Website registered, but the list could not be refreshed.');
      setData(await refreshed.json() as Payload);
      setDomain('');
      setMessage('Website registered as draft. Verification and automation remain disabled.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Registration failed.'); }
    finally { setSubmitting(false); }
  }
  return <section aria-label="Organization website registry">
    <h2>Workspace websites</h2>
    {message && <p role="status">{message}</p>}
    {data && ['owner','admin'].includes(data.organization.role) && <form onSubmit={event => void register(event)}>
      <label htmlFor="register-domain">Register website (draft only)</label>
      <input id="register-domain" value={domain} onChange={event => setDomain(event.target.value)} placeholder="example.com" required maxLength={253} />
      <label htmlFor="register-platform">Platform</label>
      <select id="register-platform" value={platform} onChange={event => setPlatform(event.target.value as typeof platform)}>
        <option value="wordpress">WordPress</option><option value="nextjs">Next.js</option>
        <option value="react">React</option><option value="static">Static</option><option value="custom">Custom</option>
      </select>
      <button type="submit" disabled={submitting}>{submitting ? 'Registering…' : 'Add draft website'}</button>
    </form>}
    {data && <><p>{data.organization.name} · {data.organization.role} · {data.websites.length} websites</p>
      <div className="siteRows">
        {data.websites.map(site => <article className="siteRow" key={site.id}>
          <div className="siteRowMain"><strong>{site.domain}</strong>
            <span>{site.platform} · {site.status} · Automation {site.automationEnabled ? 'enabled' : 'disabled'} · Publishing {site.autoPublishEnabled ? 'enabled' : 'disabled'}</span>
          </div>
          <span className="healthBadge">{site.status}</span>
          {['owner','admin'].includes(data.organization.role) && <div className="approvalActions">
            {site.automationEnabled && <button type="button" onClick={() => void disableFeature(site.id, 'automation')}>Disable automation</button>}
            {site.autoPublishEnabled && <button type="button" onClick={() => void disableFeature(site.id, 'auto_publish')}>Disable publishing</button>}
          </div>}
        </article>)}
        {!data.websites.length && <p>No websites registered in this workspace.</p>}
      </div>
    </>}
  </section>;
}
