'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { workspaceError } from './workspace-response';

type Overview = {
  organization: { name: string };
  websites: { id: string; domain: string; status: string; platform: string }[];
  websiteCount: number;
  pendingApprovals: number;
  dataLimitedToFirst100Websites: boolean;
};

export function OrganizationDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState('Loading workspace overview…');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/organization-dashboard', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw workspaceError(response, 'Workspace overview');
        return response.json() as Promise<Overview>;
      })
      .then(data => { if (!controller.signal.aborted) { setOverview(data); setMessage(''); } })
      .catch(error => {
        if (!controller.signal.aborted) {
          setOverview(null);
          setMessage(error instanceof Error ? error.message : 'Workspace overview unavailable.');
        }
      });
    return () => controller.abort();
  }, []);
  return <section className="panel">
    <h2>Workspace overview</h2>
    {message && <p role="status">{message}</p>}
    {overview && <div>
      <p>{overview.organization.name}</p>
      <p>Registered websites: {overview.websiteCount}</p>
      <p>Pending approvals: {overview.pendingApprovals}</p>
      <h3>Website portfolio</h3>
      {overview.websites.length === 0 && <p>No registered websites in this workspace.</p>}
      <div className="portfolioGrid">{overview.websites.map(site => <article className="portfolioItem" key={site.id}>
        <strong>{site.domain}</strong><span>{site.platform} · {site.status}</span>
      </article>)}</div>
      {overview.dataLimitedToFirst100Websites && <p>Showing the first 100 websites by domain.</p>}
      <p>Read-only. Automation, publishing and spending are not enabled.</p>
    </div>}
  </section>;
}
