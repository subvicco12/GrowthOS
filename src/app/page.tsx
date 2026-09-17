const sites = [
  { name: 'BarcodeQRHub', domain: 'barcodeqrhub.com', status: 'Ready to connect' },
  { name: 'PriceInsight360', domain: 'priceinsight360.com', status: 'Ready to connect' },
  { name: 'BusinessStartTools', domain: 'businessstarttools.com', status: 'Ready to connect' },
  { name: 'AI Tool Stores', domain: 'aitoolstores.com', status: 'Ready to connect' },
  { name: 'PDF Image Tools', domain: 'pdfimagetools.online', status: 'Ready to connect' },
];

export default function Dashboard() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">GrowthOS</div>
        <nav aria-label="Primary navigation">
          {['Command Center','Websites','Audits','Growth','Features','Jobs','AI & Budgets','Audit Log','Settings'].map((item, i) => (
            <a className={i === 0 ? 'nav active' : 'nav'} href="#" key={item}>{item}</a>
          ))}
        </nav>
      </aside>
      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">WEBSITE GROWTH OPERATING SYSTEM</p><h1>Command Center</h1></div>
          <button>+ Add website</button>
        </header>
        <div className="metrics">
          <article><span>Websites</span><strong>5</strong><small>central registry</small></article>
          <article><span>Connected</span><strong>0</strong><small>connector activation pending</small></article>
          <article><span>Active jobs</span><strong>0</strong><small>safe by default</small></article>
          <article><span>AI spend</span><strong>$0</strong><small>budget controlled</small></article>
        </div>
        <section className="panel">
          <div className="panelHead"><div><h2>Website Portfolio</h2><p>Connect, inspect and control every managed website from one place.</p></div><button className="secondary">Run portfolio audit</button></div>
          <div className="siteGrid">
            {sites.map(site => <article className="site" key={site.domain}><div className="siteIcon">{site.name.slice(0,2).toUpperCase()}</div><div><h3>{site.name}</h3><p>{site.domain}</p><span className="status">{site.status}</span></div><button className="ghost">Open</button></article>)}
          </div>
        </section>
        <section className="panel"><h2>Foundation controls</h2><div className="controls"><div><strong>Server-side RBAC</strong><span>Configured</span></div><div><strong>Feature kill switches</strong><span>Configured</span></div><div><strong>Audit logging</strong><span>Configured</span></div><div><strong>Job idempotency</strong><span>Configured</span></div></div></section>
      </section>
    </main>
  );
}
