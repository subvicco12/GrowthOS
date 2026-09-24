'use client';
import { useEffect, useMemo, useState } from 'react';
import { growthSites as sites, growthWorkspaces } from '../core/portfolio';
import { resolveSiteScope, siteScopeOptions } from '../core/site-scope';
import { ApprovalInboxPanel } from './approval-inbox-panel';
import { buildApprovalInboxViewModel } from '../core/approval-inbox-view';
import type { DashboardSnapshot } from '../core/dashboard-repository';

const workspaces = growthWorkspaces.map(workspace => workspace.label);
const operationalItems=[['Needs approval','needsApproval'],['In development','inDevelopment'],['In production','inProduction'],['QA failed','qaFailed'],['Ready for review','readyForReview'],['Ready for listing','readyForListing'],['Ready to publish','readyToPublish'],['Live','live'],['Exceptions','exceptions']];
const engineGroups=[{name:'Product Intelligence',engines:['Website Discovery','Automated QA','Uptime & Synthetic Monitoring','Security & Dependency Intelligence','Competitor Intelligence','Packaging Intelligence']},{name:'Growth Intelligence',engines:['Technical SEO','Search & AI Visibility','Content Intelligence','CRO & Experimentation','Social Automation','Email & Lifecycle','Organic Promotion','Reputation Intelligence']},{name:'Revenue & Operations',engines:['Monetization & Paid Growth','Retention & Referral','Revenue Attribution','Business Growth Intelligence','GitHub Engineering Agent','Governance & Cost Control']}];

export default function Dashboard() {
 const [siteId,setSiteId]=useState('');
 const [snapshot,setSnapshot]=useState<DashboardSnapshot|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const selectedSite=useMemo(()=>resolveSiteScope(sites,siteId||undefined),[siteId]);
 useEffect(()=>{let active=true;setLoading(true);setError('');const query=siteId?'?siteId='+encodeURIComponent(siteId):'';fetch('/api/dashboard'+query,{credentials:'include',cache:'no-store'}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.message||body.code||'DASHBOARD_FAILED');return body;}).then(body=>{if(active)setSnapshot(body.data)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'DASHBOARD_FAILED')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[siteId]);
 const counts=snapshot?.counts;
 const approvals=buildApprovalInboxViewModel((snapshot?.approvalInbox??[]).filter(x=>x.approvalClass!=='green').map(x=>({...x,approvalClass:x.approvalClass as 'amber'|'red'})));
 return <main className="shell">
  <aside className="sidebar"><div className="brand">GrowthOS</div><nav aria-label="Primary navigation">{workspaces.map((item,i)=><a className={i===0?'nav active':'nav'} href={i===0?'#portfolio':'#'+item.toLowerCase().replaceAll(' ','-')} key={item}>{item}</a>)}</nav></aside>
  <section className="content">
   <header className="topbar"><div><p className="eyebrow">WEBSITE GROWTH OPERATING SYSTEM</p><h1>Command Center</h1><p className="lede">Discover, test, compare, improve and grow the full website portfolio from one control plane.</p></div><div className="siteScope"><label htmlFor="website-scope">Website</label><select id="website-scope" value={siteId} onChange={e=>setSiteId(e.target.value)}>{siteScopeOptions(sites).map(option=><option value={option.value} key={option.value||"all"}>{option.label}</option>)}</select></div><button type="button">+ Add website</button></header>
   {error&&<section className="panel"><strong>Dashboard unavailable</strong><p>{error}</p></section>}{loading&&<section className="panel"><p>Loading live portfolio data…</p></section>}
   <div className="metrics"><article><span>Websites</span><strong>{siteId?(selectedSite?1:0):sites.length}</strong><small>central registry</small></article><article><span>Connected</span><strong>{snapshot?.integrations.filter(x=>x.status==='healthy').length??0}</strong><small>live connector status</small></article><article><span>Active jobs</span><strong>{counts?.activeJobs??0}</strong><small>queued + running</small></article><article><span>Needs approval</span><strong>{counts?.needsApproval??0}</strong><small>AMBER / RED decisions</small></article></div>
   <section className="panel"><div className="panelHead"><div><h2>Operations at a glance</h2><p>Live operational signals from the GrowthOS control plane.</p></div><span className="engineCount">Control plane</span></div><div className="workspaceGrid">{operationalItems.map(([label,key])=><article className="workspace" key={key}><strong>{label}</strong><span>{counts?.[key as keyof typeof counts]??0}</span></article>)}</div></section>
   <ApprovalInboxPanel items={approvals}/>
   <section className="panel" id="portfolio"><div className="panelHead"><div><h2>Website Portfolio</h2><p>{siteId&&selectedSite?'Scoped to '+selectedSite.name+'.':'All six current properties are registered in the command center.'}</p></div><button type="button" className="secondary">Run portfolio audit</button></div><div className="siteGrid">{sites.filter(s=>!siteId||s.name===selectedSite?.name).map(site=><article className="site" key={site.domain}><div className="siteIcon">{site.name.slice(0,2).toUpperCase()}</div><div><h3>{site.name}</h3><p>{site.domain}</p><span className="status">{snapshot?.integrations.some(x=>x.status==='healthy')?'connected':site.status}</span></div><button type="button" className="ghost">Open</button></article>)}</div></section>
   <section className="panel"><div className="panelHead"><div><h2>Growth workspaces</h2><p>The final admin information architecture is represented from the start.</p></div></div><div className="workspaceGrid">{workspaces.slice(1,-1).map(workspace=><article className="workspace" id={workspace.toLowerCase().replaceAll(' ','-')} key={workspace}><strong>{workspace}</strong><span>Foundation ready</span></article>)}</div></section>
   <section className="panel" id="engine-map"><div className="panelHead"><div><h2>Automation engine map</h2><p>Twenty GrowthOS engines are grouped into three operational lanes.</p></div><span className="engineCount">20 engines</span></div><div className="engineGroups">{engineGroups.map(group=><article className="engineGroup" key={group.name}><h3>{group.name}</h3>{group.engines.map(engine=><div className="engine" key={engine}><span>{engine}</span><small>Ready for connector</small></div>)}</article>)}</div></section>
   <section className="panel"><h2>Foundation controls</h2><div className="controls"><div><strong>Server-side RBAC</strong><span>Configured</span></div><div><strong>Feature & tier controls</strong><span>Configured</span></div><div><strong>Audit logging</strong><span>Configured</span></div><div><strong>Job idempotency</strong><span>Configured</span></div></div></section>
  </section>
 </main>;
}