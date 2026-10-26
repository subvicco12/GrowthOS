'use client';
import { useEffect,useState } from 'react';
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
import { journeySteps,onboardingReadiness,requireSelectedWebsite,type WebsiteScope } from '../core/workspace-journey';
import { workspaceError } from './workspace-response';

type Section='home'|'websites'|'intelligence'|'analytics'|'competitors'|'recommendations'|'approvals'|'costs'|'automation'|'connectors'|'governance';
const navigation:{id:Section;label:string}[]=[
  {id:'home',label:'Portfolio'},{id:'websites',label:'Websites'},{id:'intelligence',label:'Intelligence'},
  {id:'analytics',label:'Analytics'},{id:'competitors',label:'Competitors'},
  {id:'recommendations',label:'Recommendations'},{id:'approvals',label:'Approvals'},
  {id:'costs',label:'Cost center'},{id:'automation',label:'Controls'},
  {id:'connectors',label:'Connectors'},{id:'governance',label:'Governance'}
];
export default function Dashboard(){
  const [section,setSection]=useState<Section>('home');
  const [intelligenceVisited,setIntelligenceVisited]=useState(false);
  const [analyticsVisited,setAnalyticsVisited]=useState(false);
  const [competitorsVisited,setCompetitorsVisited]=useState(false);
  const [auth,setAuth]=useState<'loading'|'ready'|'signed-out'|'unavailable'>('loading');
  const [localWorkDirty,setLocalWorkDirty]=useState(false);
  const [websiteScope,setWebsiteScope]=useState<WebsiteScope|null>(null);
  const [websiteScopeStatus,setWebsiteScopeStatus]=useState('Loading website portfolio…');
  const [selectedWebsite,setSelectedWebsite]=useState('');
  const [workspaceEpoch,setWorkspaceEpoch]=useState(0);
  useEffect(()=>{
    const expired=()=>setAuth('signed-out');
    const hashChanged=()=>{const next=window.location.hash.slice(1);if(navigation.some(item=>item.id===next)){
      setSection(next as Section);if(next==='intelligence')setIntelligenceVisited(true);if(next==='analytics')setAnalyticsVisited(true);if(next==='competitors')setCompetitorsVisited(true);}};
    window.addEventListener('growthos-session-expired',expired);
    window.addEventListener('hashchange',hashChanged);
    const initial=window.location.hash.slice(1);
    if(navigation.some(item=>item.id===initial)){setSection(initial as Section);if(initial==='intelligence')setIntelligenceVisited(true);if(initial==='analytics')setAnalyticsVisited(true);if(initial==='competitors')setCompetitorsVisited(true);}
    void checkAuth();
    return()=>{window.removeEventListener('growthos-session-expired',expired);window.removeEventListener('hashchange',hashChanged);};
  },[]);
  useEffect(()=>{if(auth!=='ready')return;let active=true;void(async()=>{try{let cursor:string|null=null,organizationId='',websites:WebsiteScope['websites']=[];
    do{const response=await fetch('/api/organization-websites'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{credentials:'include',cache:'no-store'});
      if(!response.ok)throw workspaceError(response,'Website portfolio');const result=await response.json() as {organization:{id:string};websites:WebsiteScope['websites'];nextCursor:string|null};
      if(organizationId&&organizationId!==result.organization.id)throw Error('Organization changed. Reload before continuing.');
      organizationId=result.organization.id;websites=[...websites,...result.websites];cursor=result.nextCursor;
      if(websites.length>250)throw Error('Website portfolio exceeds the local navigation limit');
    }while(cursor&&active);
    if(active){setWebsiteScope({organizationId,websites});setWebsiteScopeStatus(websites.length?'':'No registered websites. Begin with draft onboarding.');}
   }catch(error){if(active){setWebsiteScope(null);setWebsiteScopeStatus(error instanceof Error?error.message:'Website portfolio unavailable');}}})();return()=>{active=false;};},[auth]);
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
  function allowLeavingStudio(){return !localWorkDirty||window.confirm('Local drafts and campaigns will be discarded. Export a JSON package first if you want to preserve them. Continue?');}
  function switchWebsite(id:string){if(!websiteScope)return;
    if(id)try{requireSelectedWebsite(websiteScope,id);}catch{return;}
    if(id===selectedWebsite)return;
    if((selectedWebsite||localWorkDirty)&&!window.confirm('Switch website? Unsaved local previews and editorial drafts in open workspaces may be discarded. Export them first if needed.'))return;
    setSelectedWebsite(id);setWorkspaceEpoch(n=>n+1);setIntelligenceVisited(section==='intelligence');setAnalyticsVisited(section==='analytics');setCompetitorsVisited(section==='competitors');setLocalWorkDirty(false);
  }
  function syncModuleWebsite(id:string){if(!websiteScope)return false;
    if(id)try{requireSelectedWebsite(websiteScope,id);}catch{return false;}
    if(id===selectedWebsite)return true;
    if(selectedWebsite&&!window.confirm('Switch website? Other local workspaces will be cleared to prevent stale website data. Export previews first if needed.'))return false;
    setSelectedWebsite(id);setIntelligenceVisited(section==='intelligence');setAnalyticsVisited(section==='analytics');setCompetitorsVisited(section==='competitors');
    return true;
  }
  function navigate(next:Section){setSection(next);if(next==='intelligence')setIntelligenceVisited(true);if(next==='analytics')setAnalyticsVisited(true);if(next==='competitors')setCompetitorsVisited(true);
    window.history.pushState(null,'','#'+next);window.scrollTo({top:0,behavior:'smooth'});}
  if(auth==='loading')return <main className="authShell" role="status">Checking session…</main>;
  if(auth==='signed-out')return <AuthPanel onAuthenticated={()=>{setAuth('ready');window.location.reload();}}/>;
  if(auth==='unavailable')return <main className="authShell"><div className="panel"><h1>Workspace unavailable</h1><p>Authentication status could not be verified. No workspace data is shown.</p><button onClick={()=>void checkAuth()}>Retry</button></div></main>;
  const title=navigation.find(x=>x.id===section)?.label??'Portfolio';
  return <main className="appShell">
    <aside className="appSidebar"><div className="brandMark"><span>G</span><div><strong>GrowthOS</strong><small>Private control plane</small></div></div>
      <nav aria-label="Primary navigation">{navigation.map(item=><button type="button" key={item.id} aria-current={section===item.id?'page':undefined} className={section===item.id?'sideNav active':'sideNav'} onClick={()=>navigate(item.id)}>{item.label}</button>)}</nav>
      <div className="sidebarFooter">Publishing and automation are not started here.</div>
    </aside>
    <section className="appContent"><header className="appHeader"><div><p className="eyebrow">FIRST-PARTY ADMIN</p><h1>{title}</h1><p className="lede">Selected organization scope. Unknown metrics are shown as unavailable.</p></div>
      <div className="headerActions"><OrganizationSelector onBeforeSelection={()=>{if(!allowLeavingStudio())return false;setSection('home');setSelectedWebsite('');setWebsiteScope(null);setIntelligenceVisited(false);setAnalyticsVisited(false);setCompetitorsVisited(false);setLocalWorkDirty(false);return true;}}/><button type="button" className="secondary" onClick={()=>void logout()}>Sign out</button></div></header>
      <div className="workspaceSiteBar"><label>Current website<select value={selectedWebsite} disabled={!websiteScope} onChange={e=>switchWebsite(e.target.value)}>
        <option value="">Portfolio / choose website</option>{websiteScope?.websites.map(site=><option key={site.id} value={site.id}>{site.domain} · {site.status}</option>)}</select></label>
        {websiteScopeStatus&&<small role="status">{websiteScopeStatus}</small>}</div>
      {section==='home'&&<><OrganizationDashboard/><section className="panel" aria-label="Growth workflow overview"><h2>Website growth journey</h2>
        {selectedWebsite&&websiteScope&&<div><p>Selected: {requireSelectedWebsite(websiteScope,selectedWebsite).domain}. Website-specific local previews remain unverified.</p>
          <ul>{onboardingReadiness(requireSelectedWebsite(websiteScope,selectedWebsite)).checks.map(c=><li key={c.name}>{c.name}: {c.state}</li>)}</ul></div>}
        <div className="journeyGrid">{journeySteps.map(step=><article key={step.id}><h3>{step.label}</h3><p>{step.boundary}</p>
          <button type="button" onClick={()=>navigate(step.section)}>{step.label}</button></article>)}</div>
        <p>Traffic, revenue, opportunity counts, connector health and costs remain unavailable unless their own scoped sources provide evidence. No local preview is an approval.</p>
       </section></>}{section==='websites'&&<OrganizationWebsiteRegistry/>}
      {intelligenceVisited&&<div hidden={section!=='intelligence'}><IntelligencePanel key={workspaceEpoch} preferredWebsiteId={selectedWebsite} onWebsiteChange={syncModuleWebsite} onDirtyChange={setLocalWorkDirty}/></div>}
      {analyticsVisited&&<div hidden={section!=='analytics'}><AnalyticsPanel key={workspaceEpoch} preferredWebsiteId={selectedWebsite} onWebsiteChange={syncModuleWebsite}/></div>}
      {competitorsVisited&&<div hidden={section!=='competitors'}><CompetitorWorkspace key={workspaceEpoch} preferredWebsiteId={selectedWebsite} onWebsiteChange={syncModuleWebsite}/></div>}
      {section==='recommendations'&&<RecommendationReviewPanel/>}
      {section==='approvals'&&<OrganizationApprovalInbox/>}{section==='costs'&&<CostCenter/>}
      {section==='automation'&&<OrganizationAutomationStatus/>}{section==='connectors'&&<ConnectorsPanel/>}
      {section==='governance'&&<GovernancePanel/>}
    </section>
    <nav className="mobileNav" aria-label="Mobile navigation">{navigation.map(item=><button type="button" key={item.id} aria-current={section===item.id?'page':undefined} className={section===item.id?'active':''} onClick={()=>navigate(item.id)}>{item.label}</button>)}</nav>
  </main>;
}
