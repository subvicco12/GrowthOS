import { growthSites as sites, growthWorkspaces } from '../core/portfolio';

const workspaces = growthWorkspaces.map(workspace => workspace.label);

export default function Dashboard() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">GrowthOS</div>
        <nav aria-label="Primary navigation">
          {workspaces.map((item, i) => (
            <a className={i === 0 ? 'nav active' : 'nav'} href={i === 0 ? '#portfolio' : `#${item.toLowerCase().replaceAll(' ', '-')}`} key={item}>
              {item}
            </a>
          ))}
        </nav>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">WEBSITE GROWTH OPERATING SYSTEM</p>
            <h1>Command Center</h1>
            <p className="lede">Discover, test, compare, improve and grow the full website portfolio from one control plane.</p>
          </div>
          <button type="button">+ Add website</button>
        </header>

        <div className="metrics" aria-label="Portfolio metrics">
          <article><span>Websites</span><strong>{sites.length}</strong><small>central registry</small></article>
          <article><span>Connected</span><strong>0</strong><small>connector activation pending</small></article>
          <article><span>Active jobs</span><strong>0</strong><small>safe by default</small></article>
          <article><span>AI spend</span><strong>$0</strong><small>budget controlled</small></article>
        </div>

        <section className="panel" id="portfolio">
          <div className="panelHead">
            <div><h2>Website Portfolio</h2><p>All six current properties are registered in the command-center foundation.</p></div>
            <button type="button" className="secondary">Run portfolio audit</button>
          </div>
          <div className="siteGrid">
            {sites.map(site => (
              <article className="site" key={site.domain}>
                <div className="siteIcon" aria-hidden="true">{site.name.slice(0,2).toUpperCase()}</div>
                <div><h3>{site.name}</h3><p>{site.domain}</p><span className="status">{site.status}</span></div>
                <button type="button" className="ghost">Open</button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHead">
            <div><h2>Growth workspaces</h2><p>The final admin information architecture is represented from the start.</p></div>
          </div>
          <div className="workspaceGrid">
            {workspaces.slice(1, -1).map(workspace => (
              <article className="workspace" id={workspace.toLowerCase().replaceAll(' ', '-')} key={workspace}>
                <strong>{workspace}</strong>
                <span>Foundation ready</span>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Foundation controls</h2>
          <div className="controls">
            <div><strong>Server-side RBAC</strong><span>Configured</span></div>
            <div><strong>Feature & tier controls</strong><span>Configured</span></div>
            <div><strong>Audit logging</strong><span>Configured</span></div>
            <div><strong>Job idempotency</strong><span>Configured</span></div>
          </div>
        </section>
      </section>
    </main>
  );
}
