'use client';
import { useEffect, useState } from 'react';

type Approval = {
  id: string; website_id: string; title: string;
  action_type: string; status: string; created_at: string;
};

export function OrganizationApprovalInbox() {
  const [items, setItems] = useState<Approval[]>([]);
  const [message, setMessage] = useState('Loading pending approvals…');
  useEffect(() => {
    let active = true;
    fetch('/api/organization-approvals', { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in required.' : response.status === 403 ? 'Select an authorized workspace.' : 'Approval inbox unavailable.');
        return response.json() as Promise<{ items: Approval[] }>;
      })
      .then(result => { if (active) { setItems(result.items); setMessage(''); } })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Approval inbox unavailable.'); });
    return () => { active = false; };
  }, []);
  return <section className="panel" aria-label="Organization approval inbox">
    <div className="panelHead"><div><h2>Approval inbox</h2><p>Review only. Decisions and publishing are disabled.</p></div>
      <span className="engineCount">{items.length} pending</span></div>
    {message && <p role="status">{message}</p>}
    <div className="approvalList">
      {items.map(item => <article className="approvalCard" key={item.id}>
        <div className="approvalSummary"><span><strong>{item.title}</strong>
          <small>{item.action_type} · Website {item.website_id}</small></span>
          <span>Pending</span></div>
      </article>)}
      {!items.length && !message && <p className="emptyState">No pending approvals.</p>}
    </div>
  </section>;
}
