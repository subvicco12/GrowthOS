'use client';
import {useEffect,useState} from 'react';
import {assessProductReadiness,developmentHandoff,emptyBacklog,exportBacklog,fromCompetitorOpportunity,fromAnalyticsHandoff,fromRevenueHandoff,HANDOFF_WARNING,importBacklog,validateBacklog,type ProductBacklog,type ProductProposal} from '../core/local-product-backlog';
import type {ProductOpportunity} from '../core/local-competitor-workspace';
import type {AnalyticsHandoff} from '../core/local-analytics-handoff';
import type {RevenueHandoff} from '../core/local-revenue-workspace';
const tiers=['free','pro','business'] as const;
type Props={organizationId:string;websiteId:string;role:string;opportunities:ProductOpportunity[];controls:{automationEnabled:boolean;autoPublishEnabled:boolean}|null;analyticsHandoff?:AnalyticsHandoff|null;revenueHandoff?:RevenueHandoff|null;onHandoffConsumed?:()=>void;onRevenueConsumed?:()=>void};
function EditableText({label,value,onCommit,maxLength=240}:{label:string;value:string;onCommit:(value:string)=>void;maxLength?:number}){
 const [draft,setDraft]=useState(value);useEffect(()=>setDraft(value),[value]);return <label>{label}<input value={draft} maxLength={maxLength} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==value)onCommit(draft);}}/></label>;
}
export function ProductBacklogPanel({organizationId,websiteId,role,opportunities,controls,analyticsHandoff,revenueHandoff,onHandoffConsumed,onRevenueConsumed}:Props){
 const scope={organizationId,websiteId},canEdit=['owner','admin','editor'].includes(role)&&!!organizationId&&!!websiteId;
 const [backlog,setBacklog]=useState<ProductBacklog>(()=>emptyBacklog(scope)),[pending,setPending]=useState<ProductBacklog|null>(null),[selected,setSelected]=useState(''),[error,setError]=useState('');
 const [title,setTitle]=useState(''),[problem,setProblem]=useState(''),[solution,setSolution]=useState(''),[benefit,setBenefit]=useState('');
 useEffect(()=>{setBacklog(emptyBacklog(scope));setPending(null);setSelected('');setError('');},[organizationId,websiteId]);
 const current=backlog.proposals.find(p=>p.id===selected)??null;
 const state=(p:ProductProposal)=>p.featureKey==='automation'&&controls?(controls.automationEnabled?'enabled':'disabled'):
  p.featureKey==='auto_publish'&&controls?(controls.autoPublishEnabled?'enabled':'disabled'):'unavailable';
 function update(proposals:ProductProposal[]){try{setBacklog(validateBacklog({...backlog,proposals},scope));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Backlog change refused');}}
 function addManual(){if(!canEdit){setError('BACKLOG_ROLE_DENIED');return;}
  const p:ProductProposal={id:'proposal-'+crypto.randomUUID(),...scope,origin:'manual',title:title.trim(),problem:problem.trim(),solution:solution.trim(),benefit:benefit.trim(),
   evidenceRefs:[],targetTiers:[],usageLimit:null,effort:'unknown',estimatedCostMinor:null,currency:null,dependencies:[],featureChange:'none',featureKey:null,
   requirements:[],acceptance:[],security:'',privacy:'',tests:'',rollback:'',rollout:'',requiredRole:'owner',state:'local-review-only'};
  update([...backlog.proposals,p]);setTitle('');setProblem('');setSolution('');setBenefit('');}
 function addOpportunity(o:ProductOpportunity){if(!canEdit){setError('BACKLOG_ROLE_DENIED');return;}try{update([...backlog.proposals,fromCompetitorOpportunity(o,scope)]);}catch(e){setError(e instanceof Error?e.message:'Opportunity refused');}}
 function addAnalytics(){if(!canEdit||!analyticsHandoff){setError('BACKLOG_ROLE_DENIED');return;}try{const item=fromAnalyticsHandoff(analyticsHandoff,scope);const next=validateBacklog({...backlog,proposals:[...backlog.proposals,item]},scope);setBacklog(next);setSelected(item.id);onHandoffConsumed?.();setError('');}
   catch(e){setError(e instanceof Error?e.message:'Analytics handoff refused');}}
 function addRevenue(){if(!canEdit||!revenueHandoff){setError('BACKLOG_ROLE_DENIED');return;}
  try{const item=fromRevenueHandoff(revenueHandoff,scope);const next=validateBacklog({...backlog,proposals:[...backlog.proposals,item]},scope);
   setBacklog(next);setSelected(item.id);onRevenueConsumed?.();setError('');}
  catch(e){setError(e instanceof Error?e.message:'Revenue handoff refused');}}
 function patch<K extends keyof ProductProposal>(key:K,value:ProductProposal[K]){if(!canEdit||!current)return;update(backlog.proposals.map(p=>p.id===current.id?{...p,[key]:value}:p));}
 const lines=(v:string)=>v.split('\n').map(s=>s.trim()).filter(Boolean);
 function download(content:string,name:string,type:string){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);}
 async function inspect(file:File|undefined){setPending(null);if(!file)return;try{if(!canEdit)throw Error('BACKLOG_ROLE_DENIED');if(file.size>250000)throw Error('BACKLOG_IMPORT_SIZE_DENIED');
   const p=importBacklog(new Uint8Array(await file.arrayBuffer()),scope);setPending(p);setError('');}catch(e){setError(e instanceof Error?e.message:'Import refused');}}
 return <section className="productBacklog" aria-label="Local product improvement backlog"><h3>Product improvement backlog · local preview</h3>
  <p>{HANDOFF_WARNING} Proposals and handoffs are browser-memory preparation, not saved approvals, entitlements or feature mutations.</p>{error&&<p role="alert">{error}</p>}
  {analyticsHandoff&&<div className="backlogTransfer" role="group" aria-label="Analytics opportunity handoff"><h4>Analytics review handoff · unverified</h4>
   <p>Website: {analyticsHandoff.websiteId}; period: {analyticsHandoff.from} to {analyticsHandoff.through}; source: {analyticsHandoff.provenance}; evidence IDs: {analyticsHandoff.evidenceIds.join(', ')}.</p>
   <p>Adding this creates only a local review proposal. No implementation or analytics verification occurs.</p>
   <button type="button" disabled={!canEdit||backlog.proposals.some(p=>p.origin==='analytics-import'&&p.originRef===analyticsHandoff.originRef)} onClick={addAnalytics}>Confirm local backlog copy</button></div>}
  {revenueHandoff&&<div className="backlogTransfer" role="group" aria-label="Revenue opportunity handoff"><h4>Revenue review handoff · unverified</h4>
   <p>Website: {revenueHandoff.websiteId}; provenance: {revenueHandoff.provenance}; evidence IDs: {revenueHandoff.evidenceRefs.join(', ')}. Cost and impact unknown.</p>
   <p>This copies only a local proposal. It cannot change payments, prices, entitlements or publishing.</p>
   <button type="button" disabled={!canEdit||backlog.proposals.some(p=>p.origin==='revenue-preview'&&p.originRef===revenueHandoff.id)} onClick={addRevenue}>Confirm local revenue proposal</button></div>}
  {canEdit&&<><h4>Add competitor opportunity</h4><div className="backlogCards">{opportunities.map(o=><article key={o.id}><strong>{o.title}</strong><p>Claim references: {o.claimIds.join(', ')}. Impact and cost unknown.</p><button type="button" disabled={backlog.proposals.some(p=>p.origin==='competitor-preview'&&p.originRef===o.id)} onClick={()=>addOpportunity(o)}>Copy to local backlog</button></article>)}</div>
   <fieldset className="backlogFields"><legend>Manual improvement proposal</legend><label>Title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={240}/></label>
    <label>Customer problem<input value={problem} onChange={e=>setProblem(e.target.value)} maxLength={240}/></label>
    <label>Proposed solution<input value={solution} onChange={e=>setSolution(e.target.value)} maxLength={240}/></label>
    <label>Expected customer benefit<input value={benefit} onChange={e=>setBenefit(e.target.value)} maxLength={240}/></label>
    <button type="button" onClick={addManual}>Add local proposal</button></fieldset></>}
  <label>Backlog proposal<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose proposal</option>{backlog.proposals.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
  {current&&<div className="backlogFields"><p>Origin: {current.origin}; evidence: {current.evidenceRefs.join(', ')||'missing'}. Feature status: {state(current)}.</p>
   {canEdit&&<><EditableText key={current.id+':title'} label="Title" value={current.title} onCommit={value=>patch('title',value)}/>
    <EditableText key={current.id+':problem'} label="Problem" value={current.problem} onCommit={value=>patch('problem',value)}/>
    <EditableText key={current.id+':solution'} label="Solution" value={current.solution} onCommit={value=>patch('solution',value)}/>
    <EditableText key={current.id+':benefit'} label="Customer benefit" value={current.benefit} onCommit={value=>patch('benefit',value)}/>
    <fieldset><legend>Proposed entitlements only</legend>{tiers.map(t=><label key={t}><input type="checkbox" checked={current.targetTiers.includes(t)} onChange={e=>patch('targetTiers',e.target.checked?[...current.targetTiers,t]:current.targetTiers.filter(x=>x!==t))}/>{t}</label>)}</fieldset>
    <label>Proposed usage limit (blank = unknown)<input type="number" min="0" value={current.usageLimit??''} onChange={e=>patch('usageLimit',e.target.value===''?null:Number(e.target.value))}/></label>
    <label>Feature proposal<select value={current.featureChange} onChange={e=>{const change=e.target.value as ProductProposal['featureChange'];
      update(backlog.proposals.map(p=>p.id===current.id?{...p,featureChange:change,featureKey:change==='none'?null:(p.featureKey??'automation')}:p));}}><option value="none">None</option><option value="enable">Enable review only</option><option value="disable">Disable review only</option><option value="modify">Modify review only</option></select></label>
    {current.featureChange!=='none'&&<label>Feature key<select value={current.featureKey??'automation'} onChange={e=>patch('featureKey',e.target.value)}><option value="automation">Automation</option><option value="auto_publish">Auto publishing</option><option value="other">Other · state unavailable</option></select></label>}
    <label>Effort<select value={current.effort} onChange={e=>patch('effort',e.target.value as ProductProposal['effort'])}>{['unknown','low','medium','high'].map(x=><option key={x}>{x}</option>)}</select></label>
    <fieldset><legend>Dependencies in this local backlog</legend>{backlog.proposals.filter(p=>p.id!==current.id).map(p=><label key={p.id}><input type="checkbox" checked={current.dependencies.includes(p.id)} onChange={e=>patch('dependencies',e.target.checked?[...current.dependencies,p.id]:current.dependencies.filter(id=>id!==p.id))}/>{p.title}</label>)}</fieldset>
    <label>Evidence reference IDs (one per line)<textarea value={current.evidenceRefs.join('\n')} onChange={e=>patch('evidenceRefs',lines(e.target.value))}/></label>
    <label>Estimated cost in integer minor units (blank = unknown)<input type="number" min="0" value={current.estimatedCostMinor??''} onChange={e=>{const value=e.target.value;update(backlog.proposals.map(p=>p.id===current.id?{...p,estimatedCostMinor:value===''?null:Number(value),currency:value===''?null:(p.currency??'USD')}:p));}}/></label>
    {current.estimatedCostMinor!==null&&<label>Currency (ISO 4217)<input value={current.currency??''} maxLength={3} onChange={e=>patch('currency',e.target.value.toUpperCase())}/></label>}
    {(['requirements','acceptance'] as const).map(key=><label key={key}>{key==='requirements'?'Functional requirements':'Acceptance criteria'} (one per line)<textarea value={current[key].join('\n')} onChange={e=>patch(key,lines(e.target.value))}/></label>)}
    {(['security','privacy','tests','rollout','rollback'] as const).map(key=><label key={key}>{key}<textarea value={current[key]} onChange={e=>patch(key,e.target.value)}/></label>)}
    <button type="button" onClick={()=>{if(backlog.proposals.some(p=>p.dependencies.includes(current.id))){setError('Remove dependent proposals first');return;}update(backlog.proposals.filter(p=>p.id!==current.id));setSelected('');}}>Remove local proposal</button></>}
   <div role="status"><strong>Readiness for review: {assessProductReadiness(current,scope,state(current)).readyForReview?'Checklist complete':'Blocked'}</strong>
     <p>Implementation authorized: never. Cost: {current.estimatedCostMinor===null?'unknown':current.currency+' '+current.estimatedCostMinor+' minor units'}.</p>
     <ul>{assessProductReadiness(current,scope,state(current)).blockers.map(b=><li key={b}>{b}</li>)}{assessProductReadiness(current,scope,state(current)).approvalGates.map(g=><li key={g}>Approval gate: {g}</li>)}</ul></div>
   <button type="button" onClick={()=>download(developmentHandoff(current,scope,state(current)),'growthos-review-only-handoff.md','text/markdown')}>Download review-only Markdown brief</button>
   <button type="button" onClick={()=>download(JSON.stringify({format:'growthos-product-handoff',version:1,warning:HANDOFF_WARNING,proposal:current,readiness:assessProductReadiness(current,scope,state(current))}),
    'growthos-review-only-handoff.json','application/json')}>Download review-only JSON brief</button>
  </div>}
  {canEdit&&<div className="backlogTransfer"><h4>Preserve local backlog</h4><label>Inspect versioned JSON package (250 KB maximum)<input type="file" accept=".json,application/json" onChange={e=>void inspect(e.target.files?.[0])}/></label>
   {pending&&<div role="group" aria-label="Confirm backlog import"><p>Replace {backlog.proposals.length} local proposals with {pending.proposals.length} imported local proposals?</p>
    <button type="button" onClick={()=>{setBacklog(pending);setPending(null);setSelected('');}}>Confirm replacement</button><button type="button" onClick={()=>setPending(null)}>Cancel</button></div>}
   <button type="button" onClick={()=>download(exportBacklog(backlog,scope),'growthos-local-backlog.json','application/json')}>Export backlog JSON</button></div>}
 </section>;
}
