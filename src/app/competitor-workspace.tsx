'use client';
import {useEffect,useState} from 'react';
import {compareCompetitorFeatures,exportCompetitorPackage,exportOpportunityCsv,importCompetitorPackage,productImprovementPreview,validateCompetitorPackage,type CompetitorPackage} from '../core/local-competitor-workspace';
import {workspaceError} from './workspace-response';
import {ProductBacklogPanel} from './product-backlog-panel';
type Site={id:string;domain:string;automationEnabled?:boolean;autoPublishEnabled?:boolean};type Page={websites:Site[];nextCursor:string|null;organization:{id:string;role:string}};
export function CompetitorWorkspace({preferredWebsiteId,onWebsiteChange}:{preferredWebsiteId?:string;onWebsiteChange?:(id:string)=>boolean}={}){
 const [org,setOrg]=useState(''),[role,setRole]=useState('viewer'),[sites,setSites]=useState<Site[]>([]),[site,setSite]=useState('');
 const [status,setStatus]=useState('Loading website scope…'),[error,setError]=useState(''),[data,setData]=useState<CompetitorPackage|null>(null),[pending,setPending]=useState<CompetitorPackage|null>(null);
 const [name,setName]=useState(''),[reference,setReference]=useState(''),[feature,setFeature]=useState(''),[category,setCategory]=useState('other');
 const [ownState,setOwnState]=useState<'unknown'|'planned'|'partial'|'disabled'|'reported'>('unknown'),[tiers,setTiers]=useState<Array<'free'|'pro'|'business'|'enterprise'>>(['pro']);
 const [selected,setSelected]=useState<string[]>([]),[filter,setFilter]=useState('all');
 useEffect(()=>{let active=true;void(async()=>{try{let cursor:string|null=null,organization='',userRole='viewer';const found:Site[]=[];
  do{const response=await fetch('/api/organization-websites'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{credentials:'include',cache:'no-store'});
   if(!response.ok)throw workspaceError(response,'Competitor website scope');const page=await response.json() as Page;
   if(organization&&organization!==page.organization.id)throw Error('Organization changed; reload required');
   organization=page.organization.id;userRole=page.organization.role;found.push(...page.websites);cursor=page.nextCursor;
   if(found.length>250)throw Error('Website scope exceeds local limit');}while(cursor&&active);
  if(active){setOrg(organization);setRole(userRole);setSites(found);setSite(found.some(site=>site.id===preferredWebsiteId)?preferredWebsiteId!:'');setStatus(found.length?'No competitor package loaded. Local preview only.':'No websites available.');}
 }catch(e){if(active)setStatus(e instanceof Error?e.message:'Website scope unavailable');}})();return()=>{active=false;};},[]);
 const scope={organizationId:org,websiteId:site},today=new Date().toISOString().slice(0,10),canEdit=!!org&&!!site&&['owner','admin','editor'].includes(role);
 const opportunities=data&&site?compareCompetitorFeatures(data,scope,today):[];
 function download(content:string,name:string,type:string){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);}
 function add(){try{if(!canEdit)throw Error('COMPETITOR_ROLE_DENIED');const competitorId='competitor-'+crypto.randomUUID();const featureId='feature-'+crypto.randomUUID();const observedOn=today;
  const next:CompetitorPackage=data??{format:'growthos-competitor-preview',version:1,...scope,competitors:[],ownFeatures:[],claims:[],authority:'local-preview-only'};
  const existing=next.competitors.find(c=>c.website===reference);
  const featureExisting=next.ownFeatures.find(f=>f.name.toLocaleLowerCase()===feature.trim().toLocaleLowerCase());
  const updated={...next,competitors:existing?next.competitors:[...next.competitors,{id:competitorId,name:name.trim(),website:reference,category:'manual comparison',positioning:'Unknown until independently verified',segments:[]}],
   ownFeatures:featureExisting?next.ownFeatures:[...next.ownFeatures,{id:featureId,name:feature.trim(),category:category as CompetitorPackage['ownFeatures'][number]['category'],description:'Manual feature comparison',availability:ownState,tiers:[],dependencies:[],effort:'unknown' as const,benefit:'Customer benefit requires review'}],
   claims:[...next.claims,{id:'claim-'+crypto.randomUUID(),competitorId:existing?.id??competitorId,featureId:featureExisting?.id??featureId,availability:'reported' as const,tiers,source:reference,observedOn,claim:'Manually supplied competitor feature claim',pricing:null,evidenceStatus:'unverified-manual' as const,revoked:false}]};
  setData(validateCompetitorPackage(updated,scope,today));setSelected([]);setError('');setStatus('Added unverified manual claim in browser memory only.');
 }catch(e){setError(e instanceof Error?e.message:'Claim refused');}}
 async function inspect(file:File|undefined){setPending(null);if(!file)return;try{if(!canEdit)throw Error('COMPETITOR_ROLE_DENIED');if(file.size>400000)throw Error('COMPETITOR_PACKAGE_SIZE_DENIED');
  const pkg=importCompetitorPackage(new Uint8Array(await file.arrayBuffer()),scope,today);setPending(pkg);setError('');setStatus(`Preview: ${pkg.competitors.length} competitors, ${pkg.claims.length} unverified claims. Existing local preview unchanged.`);
 }catch(e){setError(e instanceof Error?e.message:'Import refused');}}
 function exportFile(kind:'json'|'csv'){try{if(!data)throw Error('NO_LOCAL_PREVIEW');download(kind==='json'?exportCompetitorPackage(data,scope,today):exportOpportunityCsv(data,scope,today),
  'growthos-competitor-preview.'+kind,kind==='json'?'application/json':'text/csv');setError('');}catch(e){setError(e instanceof Error?e.message:'Export refused');}}
 const plan=data?productImprovementPreview(data,selected,scope,today):null;
 return <section className="panel competitorWorkspace" aria-label="Competitor intelligence local preview"><h2>Competitor intelligence</h2>
  <p>Manually supplied, unverified claims only. No website is crawled; no package changes, approvals or implementation work are authorized.</p><p role="status">{status}</p>{error&&<p role="alert">{error}</p>}
  <label>Managed website<select value={site} onChange={e=>{if(onWebsiteChange?.(e.target.value)===false)return;setSite(e.target.value);setData(null);setPending(null);setSelected([]);setError('');}}><option value="">Select website</option>{sites.map(s=><option key={s.id} value={s.id}>{s.domain}</option>)}</select></label>
  {canEdit&&<fieldset className="competitorForm"><legend>Add manual competitor feature observation</legend>
   <label>Competitor name<input value={name} maxLength={240} onChange={e=>setName(e.target.value)}/></label>
   <label>HTTPS source URL<input type="url" value={reference} maxLength={2048} onChange={e=>setReference(e.target.value)}/></label>
   <label>Feature name<input value={feature} maxLength={240} onChange={e=>setFeature(e.target.value)}/></label>
   <label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{['onboarding','reporting','analytics','export','collaboration','integration','search','accessibility','performance','support','monetization','content','other'].map(c=><option key={c}>{c}</option>)}</select></label>
   <label>Our feature state<select value={ownState} onChange={e=>setOwnState(e.target.value as typeof ownState)}>{['unknown','planned','partial','disabled','reported'].map(s=><option key={s}>{s}</option>)}</select></label>
   <fieldset><legend>Competitor reported tiers</legend>{(['free','pro','business','enterprise'] as const).map(t=><label key={t}><input type="checkbox" checked={tiers.includes(t)} onChange={e=>setTiers(old=>e.target.checked?[...old,t]:old.filter(x=>x!==t))}/>{t}</label>)}</fieldset>
   <button type="button" onClick={add}>Add unverified claim locally</button></fieldset>}
  {data&&<><h3>Feature and tier comparison</h3><label>Category filter<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All categories</option>{[...new Set(data.ownFeatures.map(f=>f.category))].map(c=><option key={c}>{c}</option>)}</select></label>
   <div className="competitorCards">{data.ownFeatures.filter(f=>filter==='all'||f.category===filter).map(f=><article key={f.id}><h4>{f.name}</h4><p>Our state: {f.availability}. Our tiers: {f.tiers.join(', ')||'unknown'}.</p>
    <ul>{data.claims.filter(c=>c.featureId===f.id).map(c=><li key={c.id}>{data.competitors.find(x=>x.id===c.competitorId)?.name}: {c.availability}; reported tiers {c.tiers.join(', ')||'unknown'}.
      <a href={c.source} target="_blank" rel="noopener noreferrer"> Source</a> · observed {c.observedOn} · unverified {c.revoked?'· revoked':''}</li>)}</ul></article>)}</div>
   <h3>Advisory opportunities</h3><div className="competitorCards">{opportunities.map(o=><article key={o.id}><h4>{o.title}</h4><p>Priority {o.priority}; scoring: gap {o.score.gap}, freshness {o.score.freshness}, reuse {o.score.reuse}, effort {o.score.effort}.</p>
    <p>Confidence low; impact and cost unknown. {o.warning.join('; ')||'Manual evidence still requires verification.'}</p><p>Claim IDs: {o.claimIds.join(', ')}.</p>
    {canEdit&&<label><input type="checkbox" checked={selected.includes(o.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,o.id]:old.filter(x=>x!==o.id))}/>Add to local plan preview</label>}</article>)}</div>
   {plan&&<div className="competitorPlan"><h3>Product improvement plan · unsaved local preview</h3><p>{plan.opportunities.length} selected; cost and impact unknown; approval not requested.</p><ul>{plan.checklist.map(c=><li key={c}>{c}</li>)}</ul></div>}
  </>}
  {site&&org&&<ProductBacklogPanel key={org+site} organizationId={org} websiteId={site} role={role} opportunities={opportunities} controls={sites.find(s=>s.id===site)?.automationEnabled===undefined?null:{automationEnabled:!!sites.find(s=>s.id===site)?.automationEnabled,autoPublishEnabled:!!sites.find(s=>s.id===site)?.autoPublishEnabled}}/>}
  {canEdit&&<div className="competitorTransfer"><h3>Versioned import and export</h3><label>Inspect JSON package (400 KB maximum)<input type="file" accept=".json,application/json" onChange={e=>void inspect(e.target.files?.[0])}/></label>
    {pending&&<div role="group" aria-label="Confirm competitor import"><p>Replace local preview with {pending.competitors.length} competitor profiles and {pending.claims.length} unverified claims?</p>
     <button type="button" onClick={()=>{setData(pending);setPending(null);setSelected([]);setStatus('Imported into browser memory only.');}}>Replace local preview</button><button type="button" onClick={()=>setPending(null)}>Cancel</button></div>}
    <button type="button" disabled={!data} onClick={()=>exportFile('json')}>Export preview JSON</button><button type="button" disabled={!data} onClick={()=>exportFile('csv')}>Export safe opportunities CSV</button></div>}
 </section>;
}
