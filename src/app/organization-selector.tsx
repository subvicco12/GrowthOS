'use client';

import { useEffect, useState } from 'react';

type Organization = { id: string; name: string; role: 'owner' | 'admin' | 'editor' | 'viewer' };

export function OrganizationSelector({onBeforeSelection,onSelectionCommitted}:{onBeforeSelection?:()=>boolean;onSelectionCommitted?:()=>void}={}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('Loading organizations…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/organizations', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to select a workspace.' : 'Organizations unavailable.');
        const result = await response.json() as { organizations: Organization[] };
        const selectionResponse = await fetch('/api/organizations/selection', { credentials: 'include', cache: 'no-store' });
        let selection = '';
        if (selectionResponse.ok) {
          const current = await selectionResponse.json() as { organization: Organization };
          selection = current.organization.id;
        }
        if (active) {
          setOrganizations(result.organizations);
          setSelected(selection);
          setStatus(result.organizations.length ? (selection ? '' : 'Select a workspace to view its data.') : 'No accessible organizations.');
        }
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : 'Organizations unavailable.');
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function choose(id: string) {
    if (!id) return;
    if(onBeforeSelection&&!onBeforeSelection())return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/organizations/selection', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: id })
      });
      if (!response.ok) throw new Error('Workspace selection was rejected.');
      onSelectionCommitted?.();
      setSelected(id);
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Workspace selection failed.');
    } finally { setBusy(false); }
  }

  return <div className="headerTools">
    <label htmlFor="organization-scope">Workspace</label>
    <select id="organization-scope" value={selected} disabled={busy || !organizations.length} onChange={event => void choose(event.target.value)}>
      <option value="">Choose workspace</option>
      {organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name} ({organization.role})</option>)}
    </select>
    {status && <small role="status">{status}</small>}
  </div>;
}
