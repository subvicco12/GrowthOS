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
  return <section aria-label="Organization website registry">
    <h2>Workspace websites</h2>
    {message && <p role="status">{message}</p>}
    {data && <><p>{data.organization.name} · {data.organization.role} · {data.websites.length} websites</p>
      <div className="siteRows">
        {data.websites.map(site => <article className="siteRow" key={site.id}>
          <div className="siteRowMain"><strong>{site.domain}</strong>
            <span>{site.platform} · {site.status} · Automation {site.automationEnabled ? 'enabled' : 'disabled'} · Publishing {site.autoPublishEnabled ? 'enabled' : 'disabled'}</span>
          </div>
          <span className="healthBadge">{site.status}</span>
        </article>)}
        {!data.websites.length && <p>No websites registered in this workspace.</p>}
      </div>
    </>}
  </section>;
}
