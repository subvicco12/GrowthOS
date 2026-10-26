'use client';
import { useEffect,useRef,useState } from 'react';
import { OrganizationSelector } from './organization-selector';
import { OrganizationWebsiteRegistry } from './organization-website-registry';
import { OrganizationApprovalInbox } from './organization-approval-inbox';
import { OrganizationDashboard } from './organization-dashboard';
import { OrganizationAutomationStatus } from './organization-automation-status';
import { AuthPanel } from './auth-panel';
import { CostCenter } from './cost-center';
import { GovernancePanel } from './governance-panel';
import { ConnectorsPanel } from './connectors-panel';
import { IntelligencePanel } from './intelligence-panel';
import { RecommendationReviewPanel } from './recommendation-review-panel';
import { AnalyticsPanel } from './analytics-panel';
import { CompetitorWorkspace } from './competitor-workspace';
import { RevenueWorkspace } from './revenue-workspace';
import type {RevenueHandoff} from '../core/local-revenue-workspace';
import type {CompetitorPackage} from '../core/local-competitor-workspace';
import type {RevenueEvidenceBundle} from '../core/local-revenue-evidence';
import { journeySteps,onboardingReadiness,requireSelectedWebsite,type WebsiteScope } from '../core/workspace-journey';
import type {AnalyticsHandoff} from '../core/local-analytics-handoff';
import {includeScopedRegistryWebsite} from '../core/scoped-website-pages';
import {useScopedWebsitePager} from './use-scoped-website-pager';
import type {WebsiteSummary} from '../core/workspace-journey';

type Section='home'|'websites'|'intelligence'|'analytics'|'competitors'|'revenue'|'recommendations'|'approvals'|'costs'|'automation'|'connectors'|'governance';
const navigation:{id:Section;label:string}[]=[
  {id:'home',label:'Portfolio'},{id:'websites',label:'Websites'},{id:'intelligence',label:'Intelligence'},
  {id:'analytics',label:'Analytics'},{id:'competitors',label:'Competitors'},{id:'revenue',label:'Revenue'},
  {id:'recommendations',label:'Recommendations'},{id:'approvals',label:'Approvals'},
  {id:'costs',label:'Cost center'},{id:'automation',label:'Controls'},
  {id:'connectors',label:'Connectors'},{id:'governance',label:'Governance'}
];
export default function Dashboard(){
  const [section,setSection]=useState<Section>('home');
  const [websitesVisited,setWebsitesVisited]=useState(false);
  const [intelligenceVisited,setIntelligenceVisited]=useState(false);
  const [analyticsVisited,setAnalyticsVisited]=useState(false);
  const [competitorsVisited,setCompetitorsVisited]=useState(false);
  const [revenueVisited,setRevenueVisited]=useState(false);
  const [auth,setAuth]=useState<'loading'|'ready'|'signed-out'|'unavailable'>('loading');
  const [localWorkDirty,setLocalWorkDirty]=useState(false);
  const {state:websitePages,pager:websitePager}=useScopedWebsitePager(auth==='ready','Website portfolio');
  const [selectedWebsite,setSelectedWebsite]=useState('');
  const [supplementalSite,setSupplementalSite]=useState<WebsiteSummary|null>(null);
  const [websiteSearch,setWebsiteSearch]=useState('');
  let websiteScope:WebsiteScope|null=websitePages.scope;
  if(websiteScope&&supplementalSite)try{websiteScope=includeScopedRegistryWebsite(websiteScope,websiteScope.organizationId,supplementalSite);}catch{websiteScope=null;}
  const visibleWebsites=websiteScope?.websites.filter(site=>site.domain.toLocaleLowerCase().includes(websiteSearch.trim().toLocaleLowerCase()))??[];
  const [workspaceEpoch,setWorkspaceEpoch]=useState(0);
  const [analyticsHandoff,setAnalyticsHandoff]=useState<AnalyticsHandoff|null>(null);
  const [revenueHandoff,setRevenueHandoff]=useState<RevenueHandoff|null>(null);
  const [competitorPackage,setCompetitorPackage]=useState<CompetitorPackage|null>(null);
  const [revenueEvidence,setRevenueEvidence]=useState<Record<string,RevenueEvidenceBundle>>({});
  const evidenceOrganization=useRef<string|null>(null);
  useEffect(()=>{const current=websitePages.scope?.organizationId;
    if(current&&evidenceOrganization.current&&current!==evidenceOrganization.current)setRevenueEvidence({});
    if(current)evidenceOrganization.current=current;
  },[websitePages.scope?.organizationId]);
  useEffect(()=>{
    const expired=()=>setAuth('signed-out');
    const hashChanged=()=>{const next=window.location.hash.slice(1);if(navigation.some(item=>item.id===next)){
      setSection(next as Section);if(next==='websites')setWebsitesVisited(true);if(next==='intelligence')setIntelligenceVisited(true);if(next==='analytics')setAnalyticsVisited(true);if(next==='competitors')setCompetitorsVisited(true);if(next==='revenue')setRevenueVisited(true);}};
    window.addEventListener('growthos-session-expired',expired);
    window.addEventListener('hashchange',hashChanged);
    const initial=window.location.hash.slice(1);
    if(navigation.some(item=>item.id===initial)){setSection(initial as Section);if(initial==='websites')setWebsitesVisited(true);if(initial==='intelligence')setIntelligenceVisited(true);if(initial==='analytics')setAnalyticsVisited(true);if(initial==='competitors')setCompetitorsVisited(true);if(initial==='revenue')setRevenueVisited(true);}
    void checkAuth();
    return()=>{window.removeEventListener('growthos-session-expired',expired);window.removeEventListener('hashchange',hashChanged);};
  },[]);
  useEffect(()=>{if(!websitePages.fatal)return;setSelectedWebsite('');setSupplementalSite(null);setAnalyticsHandoff(null);setRevenueHandoff(null);setCompetitorPackage(null);setRevenueEvidence({});setWebsitesVisited(false);setIntelligenceVisited(false);setAnalyticsVisited(false);setCompetitorsVisited(false);setRevenueVisited(false);setWorkspaceEpoch(n=>n+1);},[websitePages.fatal]);
  async function checkAuth(){
    try{const response=await fetch('/api/organizations',{credentials:'include',cache:'no-store'});
      setAuth(response.ok?'ready':response.status===401?'signed-out':'unavailable');
    }catch{setAuth('unavailable');}
  }
  async function logout(){
    try{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'include',cache:'no-store'});
      if(!response.ok)throw Error('Logout failed.');setAuth('signed-out');
    }catch{setAuth('unavailable');}
  }
  function switchWebsite(id:string){if(!websiteScope)return;
    if(id)try{requireSelectedWebsite(websiteScope,id);}catch{return;}
    if(id===selectedWebsite)return;
    if((selectedWebsite||localWorkDirty)&&!window.confirm('Switch website? Unsaved local previews and editorial drafts in open workspaces may be discarded. Export them first if needed.'))return;
    setSelectedWebsite(id);setAnalyticsHandoff(null);setRevenueHandoff(null);setCompetitorPackage(null);setWorkspaceEpoch(n=>n+1);setWebsitesVisited(section==='websites');setIntelligenceVisited(section==='intelligence');setAnalyticsVisited(section==='analytics');setCompetitorsVisited(section==='competitors');setRevenueVisited(section==='revenue');setLocalWorkDirty(false);
  }
  function syncModuleWebsite(id:string,registrySite?:WebsiteSummary,registryOrganizationId?:string){if(!websiteScope)return false;
    let nextScope=websiteScope;
    try{if(registrySite){if(registrySite.id!==id)throw Error('WORKSPACE_SCOPE_UNAVAILABLE');
      nextScope=includeScopedRegistryWebsite(websiteScope,registryOrganizationId??'',registrySite);}
      if(id)requireSelectedWebsite(nextScope,id);
    }catch{return false;}
    if(id===selectedWebsite)return true;
    if((selectedWebsite||localWorkDirty)&&!window.confirm('Switch website? Other local workspaces will be cleared to prevent stale website data. Export previews first if needed.'))return false;
    setSupplementalSite(registrySite??null);setSelectedWebsite(id);setAnalyticsHandoff(null);setRevenueHandoff(null);setCompetitorPackage(null);setWorkspaceEpoch(n=>n+1);
    setWebsitesVisited(section==='websites');setIntelligenceVisited(section==='intelligence');setAnalyticsVisited(section==='analytics');setCompetitorsVisited(section==='competitors');setRevenueVisited(section==='revenue');setLocalWorkDirty(false);
    return true;
  }
  function prepareAnalyticsReview(h:AnalyticsHandoff){if(!websiteScope||h.organizationId!==websiteScope.organizationId||h.websiteId!==selectedWebsite)return false;
    try{requireSelectedWebsite(websiteScope,h.websiteId);}catch{return false;}
    setAnalyticsHandoff(h);navigate('competitors');return true;
  }
  function prepareRevenueReview(h:RevenueHandoff){if(!websiteScope||h.organizationId!==websiteScope.organizationId||h.websiteId!==selectedWebsite)return false;
    try{requireSelectedWebsite(websiteScope,h.websiteId);}catch{return false;}
    setRevenueHandoff(h);navigate('competitors');return true;
  }
  function navigate(next:Section){setSection(next);if(next==='websites')setWebsitesVisited(true);if(next==='intelligence')setIntelligenceVisited(true);if(next==='analytics')setAnalyticsVisited(true);if(next==='competitors')setCompetitorsVisited(true);if(next==='revenue')setRevenueVisited(true);
    window.history.pushState(null,'','#'+next);window.scrollTo({top:0,behavior:'smooth'});}
  if(auth==='loading')return <main className="authShell" role="status">Checking session…</main>;
  if(auth==='signed-out')return <AuthPanel onAuthenticated={()=>{setAuth('ready');window.location.reload();}}/>;
  if(websitePages.fatal)return <main className="authShell"><div className="panel"><h1>Website scope unavailable</h1><p role="alert">{websitePages.error}. Previously loaded website data has been hidden.</p><OrganizationSelector/></div></main>;
  if(auth==='unavailable')return <main className="authShell"><div className="panel"><h1>Workspace unavailable</h1><p>Authentication status could not be verified. No workspace data is shown.</p><button onClick={()=>void checkAuth()}>Retry</button></div></main>;
  const title=navigation.find(x=>x.id===section)?.label??'Portfolio';
  return <main className="appShell">
    <aside className="appSidebar"><div className="brandMark"><span>G</span><div><strong>GrowthOS</strong><small>Private control plane</small></div></div>
      <nav aria-label="Primary navigation">{navigation.map(item=><button type="button" key={item.id} aria-current={section===item.id?'page':undefined} className={section===item.id?'sideNav active':'sideNav'} onClick={()=>navigate(item.id)}>{item.label}</button>)}</nav>
      <div className="sidebarFooter">Publishing and automation are not started here.</div>
    </aside>
    <section className="appContent"><header className="appHeader"><div><p className="eyebrow">FIRST-PARTY ADMIN</p><h1>{title}</h1><p className="lede">Selected organization scope. Unknown metrics are shown as unavailable.</p></div>
      <div className="headerActions"><OrganizationSelector onSelectionCommitted={()=>{websitePager.invalidate();setSelectedWebsite('');setSupplementalSite(null);setAnalyticsHandoff(null);}} onBeforeSelection={()=>!(websitesVisited||intelligenceVisited||analyticsVisited||competitorsVisited||localWorkDirty)||window.confirm('Change organization? Unsaved local profiles, analytics and planning previews will be discarded after selection. Export them first if needed.')}/><button type="button" className="secondary" onClick={()=>void logout()}>Sign out</button></div></header>
      <div className="workspaceSiteBar" aria-label="Website selection">
        <label>Filter loaded websites<input type="search" value={websiteSearch} maxLength={253} disabled={!websiteScope} onChange={e=>setWebsiteSearch(e.target.value)} placeholder="Filter websites already loaded" /></label>
        <label>Current website<select value={selectedWebsite} disabled={!websiteScope} onChange={e=>switchWebsite(e.target.value)}>
          <option value="">Portfolio / choose website</option>
          {websiteScope?.websites.filter(site=>!websiteSearch||site.id===selectedWebsite||visibleWebsites.some(visible=>visible.id===site.id)).map(site=><option key={site.id} value={site.id}>{site.domain} · {site.status}</option>)}
        </select></label>
        <div className="websitePageControls" role="status" aria-live="polite">
          {websiteScope&&<small>{visibleWebsites.length} matching loaded websites of {websiteScope.websites.length} loaded{websitePages.nextCursor?' · more pages available':''}. Filtering does not search unloaded websites.</small>}
          {websitePages.busy&&<small>Loading website page…</small>}
          {websitePages.error&&<small>{websitePages.error}</small>}
          {!websiteScope&&!websitePages.error&&!websitePages.busy&&<small>No registered websites available in this workspace.</small>}
          {websitePages.error&&!websitePages.fatal&&<button type="button" className="secondary" disabled={websitePages.busy} onClick={()=>void(websitePages.scope?websitePager.loadMore():websitePager.loadInitial())}>Retry website page</button>}
          {websitePages.nextCursor&&!websitePages.error&&<button type="button" className="secondary" disabled={websitePages.busy} onClick={()=>void websitePager.loadMore()}>Load more websites</button>}
        </div>
      </div>
      {section==='home'&&<><OrganizationDashboard/><section className="panel" aria-label="Growth workflow overview"><h2>Website growth journey</h2>
        {selectedWebsite&&websiteScope&&<div><p>Selected: {requireSelectedWebsite(websiteScope,selectedWebsite).domain}. Website-specific local previews remain unverified.</p>
          <ul>{onboardingReadiness(requireSelectedWebsite(websiteScope,selectedWebsite)).checks.map(c=><li key={c.name}>{c.name}: {c.state}</li>)}</ul></div>}
        <div className="journeyGrid">{journeySteps.map(step=><article key={step.id}><h3>{step.label}</h3><p>{step.boundary}</p>
          <button type="button" onClick={()=>navigate(step.section)}>{step.label}</button></article>)}</div>
        <p>Traffic, revenue, opportunity counts, connector health and costs remain unavailable unless their own scoped sources provide evidence. No local preview is an approval.</p>
       </section></>}{websitesVisited&&<div hidden={section!=='websites'}><OrganizationWebsiteRegistry key={workspaceEpoch} preferredWebsiteId={selectedWebsite} onWebsiteChange={syncModuleWebsite}/></div>}
      {intelligenceVisited&&<div hidden={section!=='intelligence'}><IntelligencePanel key={workspaceEpoch} preferredWebsiteId={selectedWebsite} onWebsiteChange={syncModuleWebsite} onDirtyChange={setLocalWorkDirty}/></div>}
      {analyticsVisited&&<div hidden={section!=='analytics'}><AnalyticsPanel key={workspaceEpoch} preferredWebsiteId={selectedWebsite} onWebsiteChange={syncModuleWebsite} onPrepareHandoff={prepareAnalyticsReview}/></div>}
      {competitorsVisited&&<div hidden={section!=='competitors'}><CompetitorWorkspace key={workspaceEpoch} preferredWebsiteId={selectedWebsite} onWebsiteChange={syncModuleWebsite} analyticsHandoff={analyticsHandoff} onHandoffConsumed={()=>setAnalyticsHandoff(null)} revenueHandoff={revenueHandoff} onRevenueConsumed={()=>setRevenueHandoff(null)} onPackageChange={setCompetitorPackage}/></div>}
      {revenueVisited&&<div hidden={section!=='revenue'}><RevenueWorkspace key={workspaceEpoch} scope={websiteScope} websiteId={selectedWebsite} role={websitePages.organization?.role??'viewer'} competitors={competitorPackage} onPrepareHandoff={prepareRevenueReview}
        evidenceBundles={Object.values(revenueEvidence).filter(b=>b.organizationId===websiteScope?.organizationId&&websiteScope.websites.some(w=>w.id===b.websiteId))}
        onEvidenceChange={b=>{if(!websiteScope||b.organizationId!==websiteScope.organizationId||b.websiteId!==selectedWebsite)return false;
          try{requireSelectedWebsite(websiteScope,b.websiteId);}catch{return false;}
          setRevenueEvidence(old=>({...old,[b.organizationId+':'+b.websiteId]:b}));return true;}}/></div>}
      {section==='recommendations'&&<RecommendationReviewPanel/>}
      {section==='approvals'&&<OrganizationApprovalInbox/>}{section==='costs'&&<CostCenter/>}
      {section==='automation'&&<OrganizationAutomationStatus/>}{section==='connectors'&&<ConnectorsPanel/>}
      {section==='governance'&&<GovernancePanel/>}
    </section>
    <nav className="mobileNav" aria-label="Mobile navigation">{navigation.map(item=><button type="button" key={item.id} aria-current={section===item.id?'page':undefined} className={section===item.id?'active':''} onClick={()=>navigate(item.id)}>{item.label}</button>)}</nav>
  </main>;
}
