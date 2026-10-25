'use client';
import { useEffect, useState } from 'react';
import type { LocalPlan } from '../core/local-growth-plan';
import { campaignPreview, channels, contentTypes, draftReadiness, objectives, type Campaign, type ContentDraft } from '../core/local-campaign-studio';
import { compareLocalRevisions, editLocalDraft, exportLocalPackage, makeLocalDraft, markLocalReview, previewLocalImport, undoLocalDraft,
  type ImportPreview, type LocalEditorialDraft } from '../core/local-editorial-package';

export function ContentCampaignStudio({plan,role,onDirtyChange}:{plan:LocalPlan;role:string;onDirtyChange?:(dirty:boolean)=>void}){
  const [entries,setEntries]=useState<LocalEditorialDraft[]>([]);
  const drafts=entries.map(e=>e.current);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [editing,setEditing]=useState('');
  const [compare,setCompare]=useState('');
  const [pendingImport,setPendingImport]=useState<ImportPreview|null>(null);
  const [fileStatus,setFileStatus]=useState('No package exported or imported.');
  const [error,setError]=useState('');
  const [filter,setFilter]=useState('all');
  const [form,setForm]=useState<Omit<ContentDraft,'id'|'organizationId'|'websiteId'|'evidence'>>({
    ideaId:'',type:'blog',channel:'website',objective:'seo',title:'',audience:'',primaryKeyword:'',secondaryKeywords:[],
    searchIntent:'unknown',outline:'',callToAction:'',linkDestination:'',caption:'',hashtags:[],creativeBrief:'',
    scenes:'',voiceover:'',captions:'',thumbnailBrief:'',editorialNotes:'',proposedDate:'',reviewDeadline:''});
  const [campaignTitle,setCampaignTitle]=useState('');
  const [campaignObjective,setCampaignObjective]=useState<Campaign['objective']>('awareness');
  const [priority,setPriority]=useState<Campaign['priority']>('normal');
  const [budget,setBudget]=useState('');
  const [currency,setCurrency]=useState('USD');
  const [campaignIds,setCampaignIds]=useState<string[]>([]);
  const edit=<K extends keyof typeof form>(key:K,value:(typeof form)[K])=>setForm(old=>({...old,[key]:value}));
  const canPrepare=['owner','admin','editor'].includes(role)&&plan.ideas.length>0;
  useEffect(()=>{onDirtyChange?.(entries.length>0||campaigns.length>0);},[entries.length,campaigns.length,onDirtyChange]);
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(entries.length||campaigns.length){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[entries.length,campaigns.length]);
  function addDraft(){try{
    if(!canPrepare||drafts.length>=30)throw Error('STUDIO_PREPARATION_DENIED');
    const existing=entries.find(e=>e.current.id===editing);
    if(existing){const patch=Object.fromEntries(Object.entries(form).filter(([key])=>key!=='ideaId')) as Partial<ContentDraft>;
      const next=editLocalDraft(existing,patch,existing.revisions.at(-1)!.number,plan,new Date().toISOString());
      setEntries(old=>old.map(e=>e.current.id===editing?next:e));setEditing('');
    }else{const draft={...form,id:crypto.randomUUID(),organizationId:plan.organizationId,websiteId:plan.websiteId,evidence:'unverified-manual' as const};
      setEntries(old=>[...old,makeLocalDraft(draft,plan,new Date().toISOString())]);}
    setError('');
  }catch(e){setError(e instanceof Error?e.message:'Draft unavailable');}}
  function editEntry(entry:LocalEditorialDraft){setEditing(entry.current.id);
    setForm(old=>Object.fromEntries(Object.keys(old).map(k=>[k,entry.current[k as keyof ContentDraft]])) as typeof old);setError('');}
  function undo(entry:LocalEditorialDraft){try{const next=undoLocalDraft(entry,entry.revisions.at(-1)!.number,plan,new Date().toISOString());
    setEntries(old=>old.map(e=>e.current.id===entry.current.id?next:e));setError('');
  }catch(e){setError(e instanceof Error?e.message:'Undo unavailable');}}
  async function download(){try{if(!canPrepare)throw Error('STUDIO_PREPARATION_DENIED');
    const text=await exportLocalPackage(plan,entries,campaigns,new Date().toISOString());
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');
    a.href=url;a.download='growthos-local-editorial.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    setFileStatus('Local JSON package downloaded. SHA-256 detects accidental corruption, not authenticity.');
  }catch(e){setError(e instanceof Error?e.message:'Export unavailable');}}
  async function inspectFile(file:File|undefined){setPendingImport(null);if(!file)return;
    try{if(!canPrepare)throw Error('STUDIO_PREPARATION_DENIED');if(file.size>2_000_000)throw Error('PACKAGE_SIZE_DENIED');
      const summary=await previewLocalImport(new Uint8Array(await file.arrayBuffer()),plan);
      setPendingImport(summary);setFileStatus(`Import preview: ${summary.summary.drafts} drafts, ${summary.summary.campaigns} campaigns, ${summary.summary.revisions} local revisions. Existing in-memory work is unchanged.`);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Package refused');setFileStatus('Package refused. Existing in-memory work is unchanged.');}}
  function applyImport(){if(!canPrepare||!pendingImport)return;
    setEntries(structuredClone(pendingImport.body.drafts));setCampaigns(structuredClone(pendingImport.body.campaigns));
    setCampaignIds([]);setEditing('');setCompare('');setPendingImport(null);
    setFileStatus('Imported into browser memory only. No server data, approval, or publication changed.');}
  function addCampaign(){try{
    if(!canPrepare||campaigns.length>=10)throw Error('CAMPAIGN_PREPARATION_DENIED');
    const item:Campaign={id:crypto.randomUUID(),organizationId:plan.organizationId,websiteId:plan.websiteId,
      title:campaignTitle,objective:campaignObjective,contentIds:campaignIds,priority,
      budgetMinor:budget===''?null:Number(budget),currency:budget===''?null:currency,
      expectedImpact:'unknown',state:'local-preview'};
    campaignPreview(plan,drafts,item);setCampaigns(old=>[...old,item]);setCampaignIds([]);setCampaignTitle('');setError('');
  }catch(e){setError(e instanceof Error?e.message:'Campaign unavailable');}}
  const shown=drafts.filter(d=>filter==='all'||d.channel===filter||d.type===filter);
  return <section className="localStudio" aria-label="Content and campaign studio">
    <h4>Content & Campaign Studio</h4><p role="status">Local browser-memory preview for {plan.websiteId}. Switching website selections or reloading discards this work unless you export it. No server draft, approval, job or publication is created.</p>
    {error&&<p role="alert">{error}</p>}
    {!canPrepare?<p role="status">Preparation requires an owner, admin or editor and at least one selected opportunity.</p>:<>
      <div className="studioFields"><h5>Prepare a content outline</h5>
        <label>Opportunity<select value={form.ideaId} disabled={!!editing} onChange={e=>edit('ideaId',e.target.value)}><option value="">Select opportunity</option>{plan.ideas.map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
        <label>Content type<select value={form.type} onChange={e=>edit('type',e.target.value as ContentDraft['type'])}>{contentTypes.map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label>
        <label>Channel<select value={form.channel} onChange={e=>edit('channel',e.target.value as ContentDraft['channel'])}>{channels.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
        <label>Objective<select value={form.objective} onChange={e=>edit('objective',e.target.value as ContentDraft['objective'])}>{objectives.map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label>
        <label>Working title<input maxLength={180} value={form.title} onChange={e=>edit('title',e.target.value)}/></label>
        <label>Audience<input maxLength={180} value={form.audience} onChange={e=>edit('audience',e.target.value)}/></label>
        <label>Primary keyword<input maxLength={120} value={form.primaryKeyword} onChange={e=>edit('primaryKeyword',e.target.value)}/></label>
        <label>Secondary keywords (comma separated)<input value={form.secondaryKeywords.join(', ')} onChange={e=>edit('secondaryKeywords',e.target.value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,10))}/></label>
        <label>Search intent<select value={form.searchIntent} onChange={e=>edit('searchIntent',e.target.value as ContentDraft['searchIntent'])}>{['unknown','informational','commercial','transactional','navigational'].map(t=><option key={t}>{t}</option>)}</select></label>
        <label>Outline<textarea maxLength={10000} value={form.outline} onChange={e=>edit('outline',e.target.value)}/></label>
        <label>Call to action<input maxLength={500} value={form.callToAction} onChange={e=>edit('callToAction',e.target.value)}/></label>
        <label>HTTPS link destination<input type="url" maxLength={2048} value={form.linkDestination} onChange={e=>edit('linkDestination',e.target.value)}/></label>
        <label>Caption or post text<textarea maxLength={2200} value={form.caption} onChange={e=>edit('caption',e.target.value)}/></label>
        <label>Hashtags (comma separated)<input value={form.hashtags.join(', ')} onChange={e=>edit('hashtags',e.target.value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,20))}/></label>
        <label>Creative brief<textarea maxLength={3000} value={form.creativeBrief} onChange={e=>edit('creativeBrief',e.target.value)}/></label>
        <label>Scene or script outline<textarea maxLength={6000} value={form.scenes} onChange={e=>edit('scenes',e.target.value)}/></label>
        <label>Voiceover notes<textarea maxLength={6000} value={form.voiceover} onChange={e=>edit('voiceover',e.target.value)}/></label>
        <label>Captions or accessibility plan<textarea maxLength={3000} value={form.captions} onChange={e=>edit('captions',e.target.value)}/></label>
        <label>Thumbnail brief<input maxLength={1000} value={form.thumbnailBrief} onChange={e=>edit('thumbnailBrief',e.target.value)}/></label>
        <label>Editorial and rights notes<textarea maxLength={3000} value={form.editorialNotes} onChange={e=>edit('editorialNotes',e.target.value)}/></label>
        <label>Editorial deadline<input type="date" value={form.reviewDeadline} onChange={e=>edit('reviewDeadline',e.target.value)}/></label>
        <label>Proposed date (planning only)<input type="date" value={form.proposedDate} onChange={e=>edit('proposedDate',e.target.value)}/></label>
        <button type="button" onClick={addDraft}>{editing?'Save local revision':'Add unsaved outline'}</button>
        {editing&&<button type="button" className="secondary" onClick={()=>setEditing('')}>Cancel editing</button>}</div>
      <div className="studioFields"><h5>Group into a local campaign</h5>
        <label>Campaign title<input maxLength={180} value={campaignTitle} onChange={e=>setCampaignTitle(e.target.value)}/></label>
        <label>Objective<select value={campaignObjective} onChange={e=>setCampaignObjective(e.target.value as Campaign['objective'])}>{objectives.map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label>
        <label>Planning priority<select value={priority} onChange={e=>setPriority(e.target.value as Campaign['priority'])}><option>low</option><option>normal</option><option>high</option></select></label>
        <label>Estimated budget in minor units (optional)<input type="number" min="0" step="1" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
        {budget!==''&&<label>Estimated budget currency<input maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>}
        {drafts.map(d=><label key={d.id}><input type="checkbox" checked={campaignIds.includes(d.id)} onChange={e=>setCampaignIds(old=>e.target.checked?[...old,d.id]:old.filter(id=>id!==d.id))}/>{d.title}</label>)}
        <p>{budget===''?'Budget unknown':'User-entered budget estimate only; available balance not verified'}. Expected impact: unknown. Approval: not requested.</p><button type="button" onClick={addCampaign}>Preview campaign</button></div>
    </>}
    <label>Filter local outlines<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option>{channels.map(c=><option key={c} value={c}>{c}</option>)}{contentTypes.map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label>
    <div className="studioCards">{shown.map(d=>{const ready=draftReadiness(d,plan),entry=entries.find(e=>e.current.id===d.id)!;return <article key={d.id}>
      <h5>{d.title}</h5><p>{d.type.replaceAll('_',' ')} · {d.channel} · {ready.state.replaceAll('-',' ')} · unverified manual source</p>
      <p>Revision {entry.revisions.at(-1)!.number} · local and unverified. Review: {entry.review.replaceAll('-',' ')}. Proposed: {d.proposedDate||'unscheduled'} · editorial deadline: {d.reviewDeadline||'unset'}</p>
      <ul>{ready.warnings.map(w=><li key={w}>{w}</li>)}</ul>
      {canPrepare&&<label>Local editorial preparation state<select value={entry.review} onChange={event=>{try{
        const next=markLocalReview(entry,event.target.value as LocalEditorialDraft['review'],plan);
        setEntries(old=>old.map(item=>item.current.id===d.id?next:item));setError('');
      }catch(e){setError(e instanceof Error?e.message:'Review unavailable');}}}>
        {['in-preparation','needs-information','ready-for-editorial-review','changes-requested-locally'].map(s=><option key={s} value={s}>{s.replaceAll('-',' ')}</option>)}</select></label>}
      {canPrepare&&<div className="studioActions"><button type="button" onClick={()=>editEntry(entry)}>Edit draft</button>
        <button type="button" className="secondary" disabled={entry.revisions.length<2} onClick={()=>undo(entry)}>Undo as new revision</button>
        <button type="button" className="secondary" onClick={()=>setCompare(old=>old===d.id?'':d.id)}>Revision history</button>
        <button type="button" className="secondary" onClick={()=>{setEntries(old=>old.filter(item=>item.current.id!==d.id));setCampaigns(old=>old.map(item=>({...item,contentIds:item.contentIds.filter(id=>id!==d.id)})));setCampaignIds(old=>old.filter(id=>id!==d.id));if(editing===d.id)setEditing('');}}>Remove local outline</button></div>}
      {compare===d.id&&<div><h5>Local revision history</h5><ol>{entry.revisions.map(r=><li key={r.number}><details><summary>Revision {r.number} · {r.at} · {r.changed.join(', ')} · {r.snapshot.title}</summary>
        <p>Objective: {r.snapshot.objective}. Audience: {r.snapshot.audience}. Keyword: {r.snapshot.primaryKeyword||'unset'}.</p>
        <p>Outline: {r.snapshot.outline||'unset'}. Editorial notes: {r.snapshot.editorialNotes||'unset'}.</p></details></li>)}</ol>
        {entry.revisions.length>1&&<p>Changed since prior revision: {compareLocalRevisions(entry,entry.revisions.length-1,entry.revisions.length).join(', ')}</p>}</div>}
    </article>;})}</div>
    <h5>Proposed calendar</h5><div className="studioCards">{drafts.filter(d=>!!d.proposedDate).sort((a,b)=>a.proposedDate.localeCompare(b.proposedDate)).map(d=><article key={d.id}>
      <strong>{d.proposedDate}</strong> · {d.title} · {d.channel}<p>Planning date only. No scheduling job exists.</p></article>)}</div>
    {!drafts.some(d=>d.proposedDate)&&<p>Unscheduled: {drafts.length} local outline(s). No calendar dates proposed.</p>}
    <h5>Campaign readiness</h5><div className="studioCards">{campaigns.map(c=>{const projection=campaignPreview(plan,drafts,c);return <article key={c.id}>
      <h5>{c.title}</h5><p>{c.objective.replaceAll('_',' ')} · {projection.contentCount} outlines · {projection.unscheduled} unscheduled</p>
      <p>Conflicting proposed dates: {projection.conflicts.join(', ')||'none'}. Budget and impact unknown; approval not requested.</p>
      <ul>{projection.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul><button type="button" className="secondary" onClick={()=>setCampaigns(old=>old.filter(item=>item.id!==c.id))}>Remove local campaign</button>
    </article>;})}</div>
    <div className="studioTransfer"><h5>Preserve local preparation</h5><p>Export includes unverified evidence references and local revision history. Its unkeyed SHA-256 checks corruption only; the file grants no authority.</p>
      <button type="button" disabled={!canPrepare} onClick={()=>void download()}>Download local JSON package</button>
      <label>Choose a local JSON package (2 MB maximum)<input type="file" accept=".json,application/json" disabled={!canPrepare} onChange={e=>void inspectFile(e.target.files?.[0])}/></label>
      <p role="status">{fileStatus}</p>{pendingImport&&<div className="importConfirm" role="group" aria-label="Confirm local replacement">
        <p>Replace {entries.length} current local drafts and {campaigns.length} campaigns with {pendingImport.summary.drafts} drafts and {pendingImport.summary.campaigns} campaigns? This cannot be undone unless you export first.</p>
        <button type="button" onClick={applyImport}>Replace local preview</button><button type="button" className="secondary" onClick={()=>{setPendingImport(null);setFileStatus('Import cancelled.');}}>Cancel import</button></div>}
    </div>
  </section>;
}
