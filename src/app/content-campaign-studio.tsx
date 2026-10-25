'use client';
import { useState } from 'react';
import type { LocalPlan } from '../core/local-growth-plan';
import { campaignPreview, channels, contentTypes, draftReadiness, objectives, type Campaign, type ContentDraft } from '../core/local-campaign-studio';

export function ContentCampaignStudio({plan,role}:{plan:LocalPlan;role:string}){
  const [drafts,setDrafts]=useState<ContentDraft[]>([]);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
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
  function addDraft(){try{
    if(!canPrepare||drafts.length>=30)throw Error('STUDIO_PREPARATION_DENIED');
    const draft={...form,id:crypto.randomUUID(),organizationId:plan.organizationId,websiteId:plan.websiteId,evidence:'unverified-manual' as const};
    draftReadiness(draft,plan);setDrafts(old=>[...old,draft]);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Draft unavailable');}}
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
    <h4>Content & Campaign Studio</h4><p role="status">Local browser-memory preview for {plan.websiteId}. Reloading or switching websites discards it. No saved draft, approval, job or publication is created.</p>
    {error&&<p role="alert">{error}</p>}
    {!canPrepare?<p role="status">Preparation requires an owner, admin or editor and at least one selected opportunity.</p>:<>
      <div className="studioFields"><h5>Prepare a content outline</h5>
        <label>Opportunity<select value={form.ideaId} onChange={e=>edit('ideaId',e.target.value)}><option value="">Select opportunity</option>{plan.ideas.map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
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
        <button type="button" onClick={addDraft}>Add unsaved outline</button></div>
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
    <div className="studioCards">{shown.map(d=>{const ready=draftReadiness(d,plan);return <article key={d.id}>
      <h5>{d.title}</h5><p>{d.type.replaceAll('_',' ')} · {d.channel} · {ready.state.replaceAll('-',' ')} · unverified manual source</p>
      <p>Proposed: {d.proposedDate||'unscheduled'} · editorial review: {d.reviewDeadline||'unset'}</p>
      <ul>{ready.warnings.map(w=><li key={w}>{w}</li>)}</ul><button type="button" className="secondary" onClick={()=>{setDrafts(old=>old.filter(item=>item.id!==d.id));setCampaigns(old=>old.map(item=>({...item,contentIds:item.contentIds.filter(id=>id!==d.id)})));setCampaignIds(old=>old.filter(id=>id!==d.id));}}>Remove local outline</button>
    </article>;})}</div>
    <h5>Proposed calendar</h5><div className="studioCards">{drafts.filter(d=>!!d.proposedDate).sort((a,b)=>a.proposedDate.localeCompare(b.proposedDate)).map(d=><article key={d.id}>
      <strong>{d.proposedDate}</strong> · {d.title} · {d.channel}<p>Planning date only. No scheduling job exists.</p></article>)}</div>
    {!drafts.some(d=>d.proposedDate)&&<p>Unscheduled: {drafts.length} local outline(s). No calendar dates proposed.</p>}
    <h5>Campaign readiness</h5><div className="studioCards">{campaigns.map(c=>{const projection=campaignPreview(plan,drafts,c);return <article key={c.id}>
      <h5>{c.title}</h5><p>{c.objective.replaceAll('_',' ')} · {projection.contentCount} outlines · {projection.unscheduled} unscheduled</p>
      <p>Conflicting proposed dates: {projection.conflicts.join(', ')||'none'}. Budget and impact unknown; approval not requested.</p>
      <ul>{projection.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul><button type="button" className="secondary" onClick={()=>setCampaigns(old=>old.filter(item=>item.id!==c.id))}>Remove local campaign</button>
    </article>;})}</div>
  </section>;
}
