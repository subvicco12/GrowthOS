'use client';
import { useEffect, useState } from 'react';
import { workspaceError } from './workspace-response';

type Website = { id: string; domain: string; automationEnabled: boolean; autoPublishEnabled: boolean };
type WebsitePage = { websites: Website[]; nextCursor: string | null; organization: { id: string } };

export function OrganizationAutomationStatus() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [message, setMessage] = useState('Loading workspace status…');
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/organization-websites', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw workspaceError(response, 'Workspace status');
        return response.json() as Promise<WebsitePage>;
      })
      .then(result => {
        if (controller.signal.aborted) return;
        setWebsites(result.websites);
        setHasMore(Boolean(result.nextCursor));
        setMessage('');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setWebsites([]);
        setHasMore(false);
        setMessage(error instanceof Error ? error.message : 'Workspace status unavailable.');
      });
    return () => controller.abort();
  }, []);
  return <section className="panel">
    <h2>Automation status</h2>
    <p>Read-only. No jobs can be started from this page.</p>
    {message && <p role="status">{message}</p>}
    {websites.map(site => <p key={site.id}>{site.domain}: Automation {site.automationEnabled ? 'on' : 'off'}, publishing {site.autoPublishEnabled ? 'on' : 'off'}</p>)}
    {hasMore && <p>Only the first page of websites is shown. Open Websites to view additional records.</p>}
  </section>;
}
