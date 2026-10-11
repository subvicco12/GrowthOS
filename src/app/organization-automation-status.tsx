'use client';
import { useEffect, useState } from 'react';

type Website = { id: string; domain: string; automationEnabled: boolean; autoPublishEnabled: boolean };

export function OrganizationAutomationStatus() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [message, setMessage] = useState('Loading workspace status…');
  useEffect(() => {
    fetch('/api/organization-websites', { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Workspace status unavailable.');
        return response.json() as Promise<{ websites: Website[] }>;
      })
      .then(result => { setWebsites(result.websites); setMessage(''); })
      .catch(() => setMessage('Workspace status unavailable.'));
  }, []);
  return <section className="panel">
    <h2>Automation status</h2>
    <p>Read-only. No jobs can be started from this page.</p>
    {message && <p role="status">{message}</p>}
    {websites.map(site => <p key={site.id}>{site.domain}: Automation {site.automationEnabled ? 'on' : 'off'}, publishing {site.autoPublishEnabled ? 'on' : 'off'}</p>)}
  </section>;
}
