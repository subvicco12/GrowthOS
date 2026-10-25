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

type Section='home'|'websites'|'intelligence'|'recommendations'|'approvals'|'costs'|'automation'|'connectors'|'governance';
const navigation:{id:Section;label:string}[]=[
  {id:'home',label:'Portfolio'},{id:'websites',label:'Websites'},{id:'intelligence',label:'Intelligence'},
  {id:'recommendations',label:'Recommendations'},{id:'approvals',label:'Approvals'},
  {id:'costs',label:'Cost center'},{id:'automation',label:'Controls'},
  {id:'connectors',label:'Connectors'},{id:'governance',label:'Governance'}
];
export default function Dashboard(){
  const [section,setSection]=useState<Section>('home');
  const [intelligenceVisited,setIntelligenceVisited]=useState(false);
  const [auth,setAuth]=useState<'loading'|'ready'|'signed-out'|'unavailable'>('loading');
  const [localWorkDirty,setLocalWorkDirty]=useState(false);
  useEffect(()=>{
    const expired=()=>setAuth('signed-out');
    const hashChanged=()=>{const next=window.location.hash.slice(1);if(navigation.some(item=>item.id===next)){
      setSection(next as Section);if(next==='intelligence')setIntelligenceVisited(true);}};
    window.addEventListener('growthos-session-expired',expired);
    window.addEventListener('hashchange',hashChanged);
    const initial=window.location.hash.slice(1);
    if(navigation.some(item=>item.id===initial)){setSection(initial as Section);if(initial==='intelligence')setIntelligenceVisited(true);}
    void checkAuth();
    return()=>{window.removeEventListener('growthos-session-expired',expired);window.removeEventListener('hashchange',hashChanged);};
  },[]);
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
  function navigate(next:Section){setSection(next);if(next==='intelligence')setIntelligenceVisited(true);
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
      <div className="headerActions"><OrganizationSelector onBeforeSelection={()=>{if(!allowLeavingStudio())return false;setSection('home');setIntelligenceVisited(false);setLocalWorkDirty(false);return true;}}/><button type="button" className="secondary" onClick={()=>void logout()}>Sign out</button></div></header>
      {section==='home'&&<OrganizationDashboard/>}{section==='websites'&&<OrganizationWebsiteRegistry/>}
      {intelligenceVisited&&<div hidden={section!=='intelligence'}><IntelligencePanel onDirtyChange={setLocalWorkDirty}/></div>}
      {section==='recommendations'&&<RecommendationReviewPanel/>}
      {section==='approvals'&&<OrganizationApprovalInbox/>}{section==='costs'&&<CostCenter/>}
      {section==='automation'&&<OrganizationAutomationStatus/>}{section==='connectors'&&<ConnectorsPanel/>}
      {section==='governance'&&<GovernancePanel/>}
    </section>
    <nav className="mobileNav" aria-label="Mobile navigation">{navigation.map(item=><button type="button" key={item.id} aria-current={section===item.id?'page':undefined} className={section===item.id?'active':''} onClick={()=>navigate(item.id)}>{item.label}</button>)}</nav>
  </main>;
}
