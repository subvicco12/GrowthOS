'use client';
import { useEffect, useState } from 'react';
import { OrganizationSelector } from './organization-selector';
import { OrganizationWebsiteRegistry } from './organization-website-registry';
import { OrganizationApprovalInbox } from './organization-approval-inbox';
import { OrganizationDashboard } from './organization-dashboard';
import { OrganizationAutomationStatus } from './organization-automation-status';

type Section = 'home' | 'websites' | 'growth' | 'automation' | 'settings';
const navigation: { id: Section; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'websites', label: 'Websites', icon: '▦' },
  { id: 'growth', label: 'Growth', icon: '↗' },
  { id: 'automation', label: 'Automation', icon: '▶' },
  { id: 'settings', label: 'Settings', icon: '⚙' }
];

function OrganizationSettings() {
  return <section className="panel">
    <h2>Workspace settings</h2>
    <p>Settings are read-only until organization-scoped administration, auditing, and safety checks are verified.</p>
    <p>No feature activation, budget changes, publishing, or paid operations are available.</p>
  </section>;
}

export default function Dashboard() {
  const [section, setSection] = useState<Section>('home');
  useEffect(() => {
    const initial = window.location.hash.slice(1);
    if (navigation.some(item => item.id === initial)) setSection(initial as Section);
  }, []);
  function navigate(next: Section) {
    setSection(next);
    window.history.replaceState(null, '', '#' + next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const title = navigation.find(item => item.id === section)?.label ?? 'Home';
  return <main className="appShell">
    <aside className="appSidebar">
      <div className="brandMark"><span>G</span><div><strong>GrowthOS</strong><small>Website growth control plane</small></div></div>
      <nav aria-label="Primary navigation">
        {navigation.map(item => <button type="button" key={item.id} className={section === item.id ? 'sideNav active' : 'sideNav'} onClick={() => navigate(item.id)}>
          <span aria-hidden="true">{item.icon}</span>{item.label}
        </button>)}
      </nav>
      <div className="sidebarFooter"><span className="statusDot" />Control plane</div>
    </aside>
    <section className="appContent">
      <header className="appHeader"><div><p className="eyebrow">WORKSPACE</p><h1>{title}</h1>
        <p className="lede">Organization-scoped controls and read-only operational status.</p></div>
        <OrganizationSelector />
      </header>
      {section === 'home' && <OrganizationDashboard />}
      {section === 'websites' && <OrganizationWebsiteRegistry />}
      {section === 'growth' && <OrganizationApprovalInbox />}
      {section === 'automation' && <OrganizationAutomationStatus />}
      {section === 'settings' && <OrganizationSettings />}
    </section>
    <nav className="mobileNav" aria-label="Mobile navigation">
      {navigation.map(item => <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
        <span aria-hidden="true">{item.icon}</span><small>{item.label}</small>
      </button>)}
    </nav>
  </main>;
}
