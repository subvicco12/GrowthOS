'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { evidenceLabel, filterReviewPage, type RecommendationProjection, type ReviewPage } from '../core/recommendation-review-projection';
import { workspaceError } from './workspace-response';

type Site={id:string;domain:string};
type Registry={organization:{id:string;role:string};websites:Site[];nextCursor:string|null};
const categories=['all','seo','content','conversion','usability','feature_review','monetization'];
const states=['all','proposed','accepted_for_planning','rejected','deferred','expired','revoked'];

export function RecommendationReviewPanel(){
  const [scope,setScope]=useState<{organizationId:string;role:string;sites:Site[]}|null>(null);
  const [siteId,setSiteId]=useState('');
  const [items,setItems]=useState<RecommendationProjection[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const seenCursors=useRef(new Set<string>());
  const [category,setCategory]=useState('all');
  const [state,setState]=useState('all');
  const [expanded,setExpanded]=useState<string|null>(null);
  const [status,setStatus]=useState('Loading websites…');
  const [availability,setAvailability]=useState<'loading'|'unavailable'|'ready'>('loading');
  const generation=useRef(0);
  useEffect(()=>{
    let active=true;
    async function load(){
      const sites:Site[]=[];const cursors=new Set<string>();let cursor:string|null=null;let organizationId='';let role='viewer';
      do {
        const response=await fetch('/api/organization-websites'+(cursor?'?cursor='+encodeURIComponent(cursor):''),
          {credentials:'include',cache:'no-store'});
        if(!response.ok)throw workspaceError(response,'Website registry');
        const page=await response.json() as Registry;
        if(!page.organization?.id||!Array.isArray(page.websites)||
          (organizationId&&organizationId!==page.organization.id)||
          (organizationId&&role!==page.organization.role)||sites.length+page.websites.length>250)
          throw Error('Website registry scope or page limit changed.');
        organizationId=page.organization.id;role=page.organization.role;sites.push(...page.websites);
        cursor=page.nextCursor;
        if(cursor){if(cursors.has(cursor))throw Error('Website registry cursor repeated.');cursors.add(cursor);}
      } while(cursor&&active);
      if(active){setScope({organizationId,role,sites});setSiteId(sites[0]?.id??'');
        setStatus(sites.length?'':'No websites registered.');}
    }
    void load().catch(error=>{if(active){setAvailability('unavailable');setStatus(error instanceof Error?error.message:'Website registry unavailable.');}});
    return()=>{active=false;generation.current++;};
  },[]);
  useEffect(()=>{
    if(!scope||!siteId)return;
    const requestGeneration=++generation.current;
    const controller=new AbortController();
    setItems([]);setCursor(null);seenCursors.current.clear();setExpanded(null);setAvailability('loading');setStatus('Loading recommendation review queue…');
    async function load(){
      const query=new URLSearchParams({organizationId:scope!.organizationId,websiteId:siteId});
      const response=await fetch('/api/organization-recommendations?'+query,{credentials:'include',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw workspaceError(response,'Recommendation review');
      const page=await response.json() as ReviewPage;
      if(page.organizationId!==scope!.organizationId||page.websiteId!==siteId||page.items?.length>50)
        throw Error('Recommendation scope or page limit changed. Reload to continue.');
      filterReviewPage(page,{category:'all',state:'all'},new Date().toISOString());
      if(generation.current===requestGeneration){setItems(page.items);setCursor(page.nextCursor);setAvailability('ready');
        setStatus(page.items.length?'':'No recommendations are available for this website.');}
    }
    void load().catch(error=>{if(generation.current===requestGeneration&&!(error instanceof Error&&error.name==='AbortError')){
      setAvailability('unavailable');setStatus(error instanceof Error?error.message:'Recommendation review unavailable.');}});
    return()=>{controller.abort();generation.current++;};
  },[scope,siteId]);
  async function loadMore(){
    if(!scope||!siteId||!cursor||availability!=='ready'||seenCursors.current.has(cursor))return;
    const requestGeneration=generation.current;const requestedCursor=cursor;
    seenCursors.current.add(requestedCursor);setStatus('Loading more recommendations…');
    try {
      const query=new URLSearchParams({organizationId:scope.organizationId,websiteId:siteId,cursor:requestedCursor});
      const response=await fetch('/api/organization-recommendations?'+query,{credentials:'include',cache:'no-store'});
      if(!response.ok)throw workspaceError(response,'Recommendation review');
      const page=await response.json() as ReviewPage;
      if(page.organizationId!==scope.organizationId||page.websiteId!==siteId||page.items?.length>50)
        throw Error('Recommendation scope or page limit changed. Reload to continue.');
      filterReviewPage(page,{category:'all',state:'all'},new Date().toISOString());
      if(generation.current!==requestGeneration)return;
      if(page.items.some(item=>items.some(old=>old.id===item.id))||items.length+page.items.length>250||
        (page.nextCursor!==null&&(page.nextCursor===requestedCursor||seenCursors.current.has(page.nextCursor))))
        throw Error('Recommendation pagination conflict. Reload to continue.');
      setItems([...items,...page.items]);setCursor(page.nextCursor);setStatus('');
    }catch(error){if(generation.current===requestGeneration){setAvailability('unavailable');setItems([]);setCursor(null);
      setStatus(error instanceof Error?error.message:'Recommendation review unavailable.');}}
  }
  const currentSite=scope?.sites.find(site=>site.id===siteId);
  const shown=scope&&availability==='ready'?filterReviewPage({organizationId:scope.organizationId,websiteId:siteId,items,nextCursor:cursor,reviewAvailable:true},
    {category,state},new Date().toISOString()):[];
  return <section className="panel recommendationPanel" aria-label="Recommendation review">
    <h2>Recommendation review</h2>
    <p>Review evidence and prepare planning decisions. Accepting a recommendation never changes a website, subscription or publication state.</p>
    <div className="reviewControls">
      <div><label htmlFor="review-site">Website</label><select id="review-site" value={siteId} disabled={!scope} onChange={event=>setSiteId(event.target.value)}>
        {scope?.sites.map(site=><option value={site.id} key={site.id}>{site.domain}</option>)}</select></div>
      <div><label htmlFor="review-category">Category</label><select id="review-category" value={category} onChange={event=>setCategory(event.target.value)}>
        {categories.map(value=><option key={value} value={value}>{value==='all'?'All categories':value.replaceAll('_',' ')}</option>)}</select></div>
      <div><label htmlFor="review-state">Review state</label><select id="review-state" value={state} onChange={event=>setState(event.target.value)}>
        {states.map(value=><option key={value} value={value}>{value==='all'?'All states':value.replaceAll('_',' ')}</option>)}</select></div>
    </div>
    <p role="status">{status||`${shown.length} recommendations shown for ${currentSite?.domain??'selected website'}.`}</p>
    {availability==='ready'&&shown.length===0&&items.length>0&&<p className="emptyState">No recommendations match these filters.</p>}
    {availability==='ready'&&<ul className="reviewIdeas">{shown.map(item=><li key={item.id}>
      <strong>{item.title}</strong><span>{item.category.replaceAll('_',' ')} · priority {item.priority} of 5 · {item.state.replaceAll('_',' ')}</span>
      <small>{evidenceLabel(item,new Date().toISOString())} · {item.sources.length} source references · revision {item.revision}</small>
      <button className="secondary" type="button" aria-expanded={expanded===item.id} onClick={()=>setExpanded(expanded===item.id?null:item.id)}>
        {expanded===item.id?'Hide details':'Review details'}</button>
      {expanded===item.id&&<div className="reviewDetails"><p><b>Problem:</b> {item.problem}</p><p><b>Proposed improvement:</b> {item.proposal}</p>
        <p><b>Expected benefit:</b> {item.expectedBenefit}</p><p>Confidence: {item.confidence.replaceAll('_',' ')}. Effort: {item.effort}. Risk: {item.risk.replaceAll('_',' ')}.</p>
        <p>Cost: {item.costMinor===null||!item.currency?'Unavailable':`${item.costMinor} minor units (${item.currency})`}.
          Evidence observed {item.observedAt}; expires {item.expiresAt}.</p>
        <h4>Source evidence</h4><ul>{item.sources.map(source=><li key={source.id}>{source.kind}: {source.url} · {source.observedAt} · expires {source.expiresAt}</li>)}</ul>
        <h4>Decision history</h4>{item.history.length?<ol>{item.history.map(event=><li key={event.id}>
          {event.decision} by {event.actorId} at {event.at}; revision {event.revision}. Reason: {event.reason}</li>)}</ol>:<p>No decision recorded.</p>}
        <fieldset disabled><legend>Planning decision</legend><label htmlFor={`reason-${item.id}`}>Review reason</label>
          <textarea id={`reason-${item.id}`} placeholder="A reason is required for every decision" />
          <div className="reviewActions"><button type="button">Accept for planning</button><button type="button">Reject</button><button type="button">Defer</button></div></fieldset>
        <p>Decisions are disabled until durable review persistence and current authority are certified. Role: {scope?.role??'unknown'}.</p>
      </div>}</li>)}</ul>}
    {availability==='ready'&&cursor&&<button type="button" className="secondary" onClick={()=>void loadMore()}>Load more recommendations</button>}
    {availability==='unavailable'&&<p>Review history and decisions are unavailable. No success state is inferred.</p>}
  </section>;
}
