'use client';
import {useState} from 'react';
import type {WebsiteScope} from '../core/workspace-journey';
import type {CompetitorPackage} from '../core/local-competitor-workspace';
import {addRevenueEvidence,emptyRevenueEvidence,exportRevenueEvidence,importRevenueEvidence,portfolioRevenueCoverage,revenueEvidenceSummary,
 type RevenueEvidenceBundle,type RevenueEvidence} from '../core/local-revenue-evidence';
import {appendProviderRevenue,emptyProviderRevenue,exportProviderRevenue,importProviderRevenue,prepareProviderReconciliationHandoff,providerPortfolioCoverage,reconcileProviderRevenue,
 type ProviderRevenueBundle,type ProviderRevenueEvent,type ProviderCategory} from '../core/local-provider-revenue';
import {portfolioProviderReadiness,providerIdentityReadiness} from '../core/provider-trust-readiness';
import {analyzeFunnel,calculateRevenueScenario,compareCompetitorPricing,emptyRevenuePreview,exportRevenuePreview,importRevenuePreview,
 prepareRevenueHandoff,revenueChannels,revenueOpportunities,validateRevenuePreview,type FunnelSnapshot,type PricingExperiment,type RevenueHandoff,
 type RevenuePreview,type RevenueScenario} from '../core/local-revenue-workspace';
const funnelFields=['landingVisits','signupStarts','signupCompletions','activations','upgradeVisits','checkoutStarts','checkoutCompletions','openingPaidSubscribers','renewals','cancellations'] as const;
const today=()=>new Date().toISOString().slice(0,10);
const lines=(raw:string)=>raw.split('\n').map(s=>s.trim()).filter(Boolean);
const blankCounts=Object.fromEntries(funnelFields.map(key=>[key,''])) as Record<typeof funnelFields[number],string>;
type Props={scope:WebsiteScope|null;websiteId:string;role:string;competitors:CompetitorPackage|null;onPrepareHandoff:(handoff:RevenueHandoff)=>boolean;
 evidenceBundles:RevenueEvidenceBundle[];onEvidenceChange:(bundle:RevenueEvidenceBundle)=>boolean};
type ProviderProps={providerBundles:ProviderRevenueBundle[];onProviderChange:(bundle:ProviderRevenueBundle)=>boolean};
export function RevenueWorkspace({scope,websiteId,role,competitors,onPrepareHandoff,evidenceBundles,onEvidenceChange,providerBundles,onProviderChange}:Props&ProviderProps){
 const organizationId=scope?.organizationId??'',site=scope?.websites.find(w=>w.id===websiteId);
 const identity={organizationId,websiteId};const canEdit=!!site&&['owner','admin','editor'].includes(role);
 const [preview,setPreview]=useState<RevenuePreview|null>(null),[pending,setPending]=useState<RevenuePreview|null>(null);
 const [category,setCategory]=useState('Unknown category'),[objective,setObjective]=useState('Review customer value');
 const [subscription,setSubscription]=useState<RevenuePreview['profile']['subscriptionModel']>('unknown');
 const [features,setFeatures]=useState({free:'',pro:'',business:''});
 const [prices,setPrices]=useState({free:'',pro:'',business:''});
 const [currency,setCurrency]=useState('USD'),[interval,setInterval]=useState<'month'|'year'>('month'),[region,setRegion]=useState('Unspecified region');
 const [counts,setCounts]=useState({...blankCounts}),[funnelFrom,setFunnelFrom]=useState(''),[funnelThrough,setFunnelThrough]=useState('');
 const [source,setSource]=useState('Manual funnel observation');
 const [assumption,setAssumption]=useState('Hypothetical customer value assumption'),[audience,setAudience]=useState(''),[baseline,setBaseline]=useState(''),[proposed,setProposed]=useState(''),[value,setValue]=useState('');
 const [scenarioKind,setScenarioKind]=useState<RevenueScenario['kind']>('paid-conversion');
 const [hypothesis,setHypothesis]=useState(''),[segment,setSegment]=useState(''),[customerBenefit,setCustomerBenefit]=useState('');
 const [measurement,setMeasurement]=useState(''),[successCriteria,setSuccessCriteria]=useState(''),[rollback,setRollback]=useState(''),[risks,setRisks]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [pendingEvidence,setPendingEvidence]=useState<RevenueEvidenceBundle|null>(null);
 const [evidenceSource,setEvidenceSource]=useState<RevenueEvidence['source']>('subscription'),[evidenceLabel,setEvidenceLabel]=useState(''),[evidenceRef,setEvidenceRef]=useState('');
 const [evidenceFrom,setEvidenceFrom]=useState(''),[evidenceThrough,setEvidenceThrough]=useState(''),[evidenceObserved,setEvidenceObserved]=useState('');
 const [evidenceAmount,setEvidenceAmount]=useState(''),[evidenceCurrency,setEvidenceCurrency]=useState('USD');
 const [evidenceBasis,setEvidenceBasis]=useState<RevenueEvidence['basis']>('gross-reported');
 const [pendingProvider,setPendingProvider]=useState<ProviderRevenueBundle|null>(null),[providerKind,setProviderKind]=useState<ProviderCategory>('paddle');
 const [providerId,setProviderId]=useState(''),[providerAccount,setProviderAccount]=useState(''),[providerResource,setProviderResource]=useState('');
 const [sourceRecord,setSourceRecord]=useState(''),[sourceEvent,setSourceEvent]=useState(''),[batch,setBatch]=useState('');
 const [providerState,setProviderState]=useState('completed'),[providerBasis,setProviderBasis]=useState<ProviderRevenueEvent['basis']>('gross');
 const [providerAmount,setProviderAmount]=useState(''),[providerCurrency,setProviderCurrency]=useState('USD');
 const [providerFrom,setProviderFrom]=useState(''),[providerThrough,setProviderThrough]=useState(''),[providerAt,setProviderAt]=useState('');
 const [providerSettlement,setProviderSettlement]=useState(''),[relatedEvent,setRelatedEvent]=useState('');
 const current=preview&&preview.organizationId===organizationId&&preview.websiteId===websiteId?preview:null;
 const evidence=evidenceBundles.find(b=>b.organizationId===organizationId&&b.websiteId===websiteId)??null;
 const evidenceSummary=site?revenueEvidenceSummary(evidence??emptyRevenueEvidence(identity),identity,today()):null;
 const portfolio=scope?portfolioRevenueCoverage(evidenceBundles,organizationId,scope.websites.map(w=>w.id),today()):[];
 const providerBundle=providerBundles.find(b=>b.organizationId===organizationId&&b.websiteId===websiteId)??null;
 const reconciliation=site?reconcileProviderRevenue(providerBundle??emptyProviderRevenue(identity),identity,new Date().toISOString()):null;
 const providerPortfolio=scope?providerPortfolioCoverage(providerBundles,organizationId,scope.websites.map(w=>w.id),new Date().toISOString()):[];
 const identityReadiness=site?providerIdentityReadiness(providerBundle??emptyProviderRevenue(identity),identity,new Date().toISOString()):null;
 const portfolioReadiness=scope?portfolioProviderReadiness(providerBundles,organizationId,scope.websites.map(w=>w.id),new Date().toISOString()):[];
 const competitor=competitors&&competitors.organizationId===organizationId&&competitors.websiteId===websiteId?competitors:null;
 const opportunities=current?revenueOpportunities(current,identity,today(),competitor):[];
 const comparisons=current&&competitor?compareCompetitorPricing(competitor,identity,today(),current):[];
 const update=(candidate:RevenuePreview)=>{if(!canEdit)throw Error('REVENUE_ROLE_DENIED');setPreview(validateRevenuePreview(candidate,identity));setError('');setNotice('Unsaved local preview updated. No payment, entitlement or website change occurred.');};
 const act=(fn:()=>void)=>{try{fn();}catch(e){setError(e instanceof Error?e.message:'Local revenue input refused');}};
 function saveProfile(){act(()=>{const old=current??emptyRevenuePreview(identity);
  const tiers=(['free','pro','business'] as const).map(tier=>({tier,features:lines(features[tier]),usageLimit:null,
   price:prices[tier]===''?null:{minor:Number(prices[tier]),currency,interval,region}}));
  update({...old,profile:{...old.profile,category,objective,subscriptionModel:subscription,tiers}});
 });}
 function saveFunnel(){act(()=>{const old=current??emptyRevenuePreview(identity);
  const record={id:'funnel-'+crypto.randomUUID(),from:funnelFrom,through:funnelThrough,source,provenance:'manual-unverified' as const,
   visitorDefinition:'sessions' as const,...Object.fromEntries(funnelFields.map(k=>[k,counts[k]===''?null:Number(counts[k])]))} as FunnelSnapshot;
  update({...old,funnels:[...old.funnels,record]});setCounts({...blankCounts});
 });}
 function saveScenario(){act(()=>{const old=current??emptyRevenuePreview(identity);
  if([audience,baseline,proposed,value].some(v=>v.trim()===''))throw Error('REVENUE_EXPLICIT_ASSUMPTIONS_REQUIRED');
  const item:RevenueScenario={id:'scenario-'+crypto.randomUUID(),kind:scenarioKind,periodFrom:funnelFrom,periodThrough:funnelThrough,currency,
   audienceCount:Number(audience),baselineOutcomes:Number(baseline),proposedOutcomes:Number(proposed),valuePerOutcomeMinor:Number(value),
   assumption,state:'hypothetical-local-only'};
  calculateRevenueScenario(item);update({...old,scenarios:[...old.scenarios,item]});
 });}
 function saveExperiment(){act(()=>{const old=current??emptyRevenuePreview(identity);
  const item:PricingExperiment={id:'experiment-'+crypto.randomUUID(),hypothesis,segment,existingTier:'pro',alternativeTier:'business',
   existingPrice:prices.pro===''?null:{minor:Number(prices.pro),currency,interval,region},
   alternativePrice:prices.business===''?null:{minor:Number(prices.business),currency,interval,region},
   customerBenefit,risks,measurement,successCriteria,rollback,state:'local-review-only'};
  update({...old,experiments:[...old.experiments,item]});
 });}
 function saveEvidence(){act(()=>{if(!canEdit||!site)throw Error('REVENUE_ROLE_DENIED');if(evidenceAmount.trim()==='')throw Error('REVENUE_EVIDENCE_AMOUNT_REQUIRED');
  const record:RevenueEvidence={id:'evidence-'+crypto.randomUUID(),...identity,source:evidenceSource,sourceLabel:evidenceLabel,externalReference:evidenceRef,
   from:evidenceFrom,through:evidenceThrough,observedOn:evidenceObserved,currency:evidenceCurrency,amountMinor:Number(evidenceAmount),
   basis:evidenceBasis,provenance:'manual-unverified',reconciliation:'not-reconciled',authority:'none'};
  const next=addRevenueEvidence(evidence??emptyRevenueEvidence(identity),record,identity,today());
  if(!onEvidenceChange(next))throw Error('REVENUE_EVIDENCE_SCOPE_CHANGED');setNotice('Manual revenue observation retained in browser memory only; not reconciled or verified.');
 });}
 async function inspectEvidence(file:File|undefined){setPendingEvidence(null);if(!file)return;try{if(!canEdit)throw Error('REVENUE_ROLE_DENIED');
  if(file.size>250_000)throw Error('REVENUE_EVIDENCE_SIZE_DENIED');const next=importRevenueEvidence(new Uint8Array(await file.arrayBuffer()),identity,today());
  setPendingEvidence(next);setError('');setNotice(`Evidence import preview: ${next.observations.length} unverified records. Current local evidence unchanged.`);
 }catch(e){setError(e instanceof Error?e.message:'Evidence package refused');}}
 function downloadEvidence(){act(()=>{if(!evidence)throw Error('REVENUE_EVIDENCE_UNAVAILABLE');const blob=new Blob([exportRevenueEvidence(evidence,identity,today())],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='growthos-revenue-evidence-review-only.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 });}
 function saveProvider(){act(()=>{if(!canEdit||!site)throw Error('REVENUE_ROLE_DENIED');if(providerAmount.trim()===''||!providerAt)throw Error('PROVIDER_INPUT_REQUIRED');
  const e:ProviderRevenueEvent={id:'pe-'+crypto.randomUUID(),...identity,category:providerKind,providerId,accountId:providerAccount,resourceId:providerResource,
   sourceRecordId:sourceRecord,sourceEventId:sourceEvent,importBatchId:batch,periodFrom:providerFrom,periodThrough:providerThrough,
   occurredAt:new Date(providerAt).toISOString(),currency:providerCurrency as ProviderRevenueEvent['currency'],amountMinor:Number(providerAmount),
   basis:providerBasis,state:providerState,settlementReference:providerSettlement||null,relatedEventId:relatedEvent||null,
   provenance:'manual-unverified',verification:'unverified',authority:'none'};
  const next=appendProviderRevenue(providerBundle??emptyProviderRevenue(identity),e,identity,new Date().toISOString());
  if(!onProviderChange(next))throw Error('PROVIDER_SCOPE_CHANGED');setNotice('Provider-shaped manual record added locally; no settlement verified.');
 });}
 async function inspectProvider(file:File|undefined){setPendingProvider(null);if(!file)return;try{if(!canEdit)throw Error('REVENUE_ROLE_DENIED');
  if(file.size>250_000)throw Error('PROVIDER_PACKAGE_SIZE_DENIED');const next=importProviderRevenue(new Uint8Array(await file.arrayBuffer()),identity,new Date().toISOString());
  setPendingProvider(next);setError('');setNotice(`Provider package preview: ${next.events.length} unverified events. Nothing replaced yet.`);
 }catch(e){setError(e instanceof Error?e.message:'Provider package refused');}}
 function downloadProvider(){act(()=>{if(!providerBundle)throw Error('PROVIDER_PACKAGE_UNAVAILABLE');const blob=new Blob([exportProviderRevenue(providerBundle,identity,new Date().toISOString())],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='growthos-provider-reconciliation-review-only.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 });}
 function transferReconciliation(){act(()=>{if(!canEdit||!reconciliation?.exceptions.length)throw Error('PROVIDER_HANDOFF_DENIED');
  const h=prepareProviderReconciliationHandoff(providerBundle??emptyProviderRevenue(identity),identity,new Date().toISOString());
  if(!window.confirm('Prepare a review-only reconciliation gap in the local product backlog? No provider or payment change will occur.'))return;
  if(!onPrepareHandoff(h))throw Error('PROVIDER_HANDOFF_SCOPE_CHANGED');setNotice('Review-only reconciliation handoff prepared.');
 });}
 function transfer(id:string){act(()=>{if(!canEdit||!current)throw Error('REVENUE_ROLE_DENIED');
  const h=prepareRevenueHandoff(current,identity,today(),id,competitor);
  if(!window.confirm('Prepare an unverified local revenue proposal for the product backlog? No pricing, entitlement or payment change will occur.'))return;
  if(!onPrepareHandoff(h))throw Error('REVENUE_HANDOFF_SCOPE_CHANGED');setNotice('Review-only handoff prepared. Confirm the copy in the product backlog.');
 });}
 function download(){act(()=>{if(!current)throw Error('REVENUE_PREVIEW_UNAVAILABLE');const blob=new Blob([exportRevenuePreview(current,identity)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='growthos-revenue-review-only.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 });}
 async function inspect(file:File|undefined){setPending(null);if(!file)return;try{if(!canEdit)throw Error('REVENUE_ROLE_DENIED');
  if(file.size>250_000)throw Error('REVENUE_IMPORT_SIZE_DENIED');const next=importRevenuePreview(new Uint8Array(await file.arrayBuffer()),identity);
  setPending(next);setError('');setNotice(`Import preview: ${next.funnels.length} unverified funnels, ${next.scenarios.length} hypothetical scenarios, ${next.experiments.length} local experiments. No work replaced yet.`);
 }catch(e){setError(e instanceof Error?e.message:'Revenue package refused');}}
 if(!scope)return <section className="panel"><h2>Revenue intelligence</h2><p>Website scope unavailable. No revenue data is shown.</p></section>;
 return <section className="panel revenueWorkspace" aria-label="Revenue intelligence local workspace"><h2>Revenue intelligence · review only</h2>
  <p>Manual observations, unverified competitor claims and hypothetical scenarios only. Actual settled revenue, conversion evidence and current prices are unavailable without trusted sources. No payment or publishing action is available.</p>
  {!site?<><p>Choose a website in the portfolio selector to prepare a scoped review. Coverage below includes loaded websites only; it does not aggregate unverified records into earnings.</p>
   <div className="revenueCards">{portfolio.map(p=>{const provider=providerPortfolio.find(x=>x.websiteId===p.websiteId);return <article key={p.websiteId}><strong>{scope.websites.find(w=>w.id===p.websiteId)?.domain}</strong>
    <p>{p.observationCount} local observation(s); sources: {p.sourceCoverage.join(', ')||'Unavailable'}; {provider?.events??0} provider-shaped event(s); providers: {provider?.providers.join(', ')||'Unavailable'}; {portfolioReadiness.find(x=>x.websiteId===p.websiteId)?.identityClaims??0} unverified identity claim(s); {provider?.exceptions??0} unresolved exception(s). Actual revenue: Unavailable.</p></article>;})}</div></>:
  <><p><strong>{site.domain}</strong> · organization {organizationId} · {site.status}. Local profile: {current?.profile.subscriptionModel??'Unavailable'}; verified revenue: Unavailable.</p>
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
   {!canEdit&&<p>Read-only role. Local revenue editing and handoffs are unavailable.</p>}
   {canEdit&&<><fieldset className="revenueForm"><legend>Website business model · manual and unverified</legend>
    <label>Website category<input value={category} maxLength={240} onChange={e=>setCategory(e.target.value)}/></label>
    <label>Business objective<input value={objective} maxLength={240} onChange={e=>setObjective(e.target.value)}/></label>
    <label>Subscription structure<select value={subscription} onChange={e=>setSubscription(e.target.value as typeof subscription)}>{['unknown','free','free-pro-business','subscription','none'].map(v=><option key={v}>{v}</option>)}</select></label>
    <fieldset className="revenueWide"><legend>Observed or proposed monetization channels · manual only</legend>{revenueChannels.map(c=><label key={c}><input type="checkbox" checked={current?.profile.channels.includes(c)??false} onChange={e=>act(()=>{const old=current??emptyRevenuePreview(identity);
      update({...old,profile:{...old.profile,channels:e.target.checked?[...old.profile.channels,c]:old.profile.channels.filter(x=>x!==c)}});})}/>{c}</label>)}</fieldset>
    <p className="revenueWide">Proposed Free / Pro / Business features (one per line). Prices are proposals in integer minor units, not live catalog prices.</p>
    {(['free','pro','business'] as const).map(t=><div className="revenueTier" key={t}><strong>{t}</strong><label>Proposed features<textarea value={features[t]} onChange={e=>setFeatures(old=>({...old,[t]:e.target.value}))}/></label>
     <label>Proposed price in minor units (blank = unknown)<input type="number" min="0" step="1" value={prices[t]} onChange={e=>setPrices(old=>({...old,[t]:e.target.value}))}/></label></div>)}
    <label>Price currency<input value={currency} maxLength={3} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>
    <label>Billing interval<select value={interval} onChange={e=>setInterval(e.target.value as typeof interval)}><option value="month">Month</option><option value="year">Year</option></select></label>
    <label>Region of own proposal<input value={region} maxLength={60} onChange={e=>setRegion(e.target.value)}/></label>
    <button type="button" onClick={saveProfile}>Save in browser memory only</button></fieldset>
   <fieldset className="revenueForm"><legend>Manual funnel · one source and period</legend><label>From<input type="date" value={funnelFrom} onChange={e=>setFunnelFrom(e.target.value)}/></label><label>Through<input type="date" value={funnelThrough} onChange={e=>setFunnelThrough(e.target.value)}/></label>
    <label>Observation source<input value={source} maxLength={240} onChange={e=>setSource(e.target.value)}/></label>
    {funnelFields.map(k=><label key={k}>{k.replaceAll(/([A-Z])/g,' $1')} (blank = unavailable)<input type="number" min="0" step="1" value={counts[k]} onChange={e=>setCounts(old=>({...old,[k]:e.target.value}))}/></label>)}
    <button type="button" onClick={saveFunnel}>Add unverified funnel locally</button></fieldset>
   <fieldset className="revenueForm"><legend>Hypothetical scenario · not a forecast</legend>
    <label>Kind<select value={scenarioKind} onChange={e=>setScenarioKind(e.target.value as typeof scenarioKind)}>{['paid-conversion','retention','annual-adoption','qualified-leads','affiliate','advertising'].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Explicit assumption<input value={assumption} maxLength={240} onChange={e=>setAssumption(e.target.value)}/></label>
    {([['audienceCount',audience,setAudience],['baselineOutcomes',baseline,setBaseline],['proposedOutcomes',proposed,setProposed],['valuePerOutcomeMinor',value,setValue]] as const).map(([label,v,set])=><label key={label}>{label}<input type="number" min="0" step="1" value={v} onChange={e=>set(e.target.value)}/></label>)}
    <p className="revenueWide">Uses the funnel period and proposed currency above. All inputs are assumptions, including value per outcome; costs and payment settlement are excluded.</p>
    <button type="button" onClick={saveScenario}>Calculate local scenario</button></fieldset>
   <fieldset className="revenueForm"><legend>Pricing experiment · preparation only</legend>
    {([['Hypothesis',hypothesis,setHypothesis],['Customer segment',segment,setSegment],['Customer benefit',customerBenefit,setCustomerBenefit],
      ['Risks',risks,setRisks],['Measurement requirements',measurement,setMeasurement],['Success criteria',successCriteria,setSuccessCriteria],['Rollback preparation',rollback,setRollback]] as const)
     .map(([label,v,set])=><label key={label}>{label}<input value={v} maxLength={240} onChange={e=>set(e.target.value)}/></label>)}
    <p className="revenueWide">Compares the proposed Pro and Business prices above, where supplied. No experiment is activated.</p>
    <button type="button" onClick={saveExperiment}>Prepare local experiment</button></fieldset></>}
   <div className="revenueCards"><article><h3>Business model</h3><p>{current?.profile.subscriptionModel??'Unavailable'} · {current?.profile.channels.join(', ')||'No manually recorded channels'}.</p></article>
    <article><h3>Revenue evidence</h3><p>Verified revenue: Unavailable. Imported revenue attribution is not payment settlement.</p></article>
    <article><h3>Conversion evidence</h3><p>{current?.funnels.length??0} unverified local funnel(s). No live analytics.</p></article>
    <article><h3>Pricing review</h3><p>{current?.profile.tiers.length??0} proposed tiers; {comparisons.length} applicable competitor feature claim(s). Region and equivalence require review.</p></article></div>
   <h3>Revenue evidence and reconciliation preparation</h3><p>{evidenceSummary?.observationCount??0} scoped local observation(s). Represented: {evidenceSummary?.representedSources.join(', ')||'Unavailable'}.
    Missing evidence channels: {evidenceSummary?.missingSources.join(', ')||'none among supported categories'}. Actual verified and reconciled revenue: Unavailable.</p>
   {canEdit&&<fieldset className="revenueForm"><legend>Add manual revenue observation · unverified</legend>
    <label>Revenue source<select value={evidenceSource} onChange={e=>setEvidenceSource(e.target.value as RevenueEvidence['source'])}>{['subscription','advertising','affiliate','lead-generation','digital-products','business-services','other'].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Source account or report label<input value={evidenceLabel} maxLength={240} onChange={e=>setEvidenceLabel(e.target.value)}/></label>
    <label>External transaction, payout or report reference<input value={evidenceRef} maxLength={240} onChange={e=>setEvidenceRef(e.target.value)}/></label>
    <label>Period from<input type="date" value={evidenceFrom} onChange={e=>setEvidenceFrom(e.target.value)}/></label>
    <label>Period through<input type="date" value={evidenceThrough} onChange={e=>setEvidenceThrough(e.target.value)}/></label>
    <label>Report observed on<input type="date" value={evidenceObserved} onChange={e=>setEvidenceObserved(e.target.value)}/></label>
    <label>Amount in minor currency units<input type="number" min="0" step="1" value={evidenceAmount} onChange={e=>setEvidenceAmount(e.target.value)}/></label>
    <label>Currency<input value={evidenceCurrency} maxLength={3} onChange={e=>setEvidenceCurrency(e.target.value.toUpperCase())}/></label>
    <label>Reporting basis<select value={evidenceBasis} onChange={e=>setEvidenceBasis(e.target.value as RevenueEvidence['basis'])}>{['gross-reported','net-reported','attributed','estimated'].map(v=><option key={v}>{v}</option>)}</select></label>
    <button type="button" onClick={saveEvidence}>Add unverified observation locally</button></fieldset>}
   {evidenceSummary?.groups.length?<div className="revenueCards">{evidenceSummary.groups.map(g=><article key={[g.currency,g.source,g.basis,g.from,g.through].join(':')}>
    <strong>{g.source} · {g.currency} {g.amountMinor} minor units</strong><p>{g.basis}, {g.from}–{g.through}; {g.observationIds.length} observation(s).</p>
    <small>Comparable local report group only. Not settled, independently verified or portfolio earnings.</small></article>)}</div>:<p>No local revenue evidence. Revenue remains unavailable.</p>}
   <details><summary>Reconciliation requirements</summary><ul>{evidenceSummary?.blockers.map(b=><li key={b}>{b}</li>)}</ul></details>
   {canEdit&&<div className="revenueTransfer"><label>Inspect revenue evidence JSON (250 KB maximum)<input type="file" accept=".json,application/json" onChange={e=>void inspectEvidence(e.target.files?.[0])}/></label>
    {pendingEvidence&&<div role="group" aria-label="Confirm revenue evidence import"><p>Replace local evidence with {pendingEvidence.observations.length} unverified records?</p>
     <button type="button" onClick={()=>{if(!onEvidenceChange(pendingEvidence)){setError('REVENUE_EVIDENCE_SCOPE_CHANGED');return;}setPendingEvidence(null);setNotice('Local evidence replaced. No records were verified.');}}>Confirm local replacement</button>
     <button type="button" onClick={()=>setPendingEvidence(null)}>Cancel</button></div>}
    <button type="button" disabled={!evidence} onClick={downloadEvidence}>Export evidence review JSON</button></div>}
   <h3>Provider settlement intelligence · offline and unverified</h3><p>Provider-shaped observations do not authenticate an account, settle a payout or certify reconciliation. Verified revenue: Unavailable.</p>
   <div className="revenueCards">{identityReadiness?.identities.map(p=><article key={[p.category,p.providerId,p.accountId,p.resourceId].join(':')}>
    <strong>{p.category} · {p.providerId}</strong><p>Account claim: {p.accountId}; resource claim: {p.resourceId}; {p.eventCount} event(s). Last local event: {p.lastEventAt}.</p>
    <p>Identity: {p.identityState}; signature: {p.signatureState}; settlement: {p.settlementState}. Verification requirements:</p>
    <ul>{p.requirements.map(x=><li key={x}>{x}</li>)}</ul></article>)}</div>
   {canEdit&&<fieldset className="revenueForm"><legend>Prepare one manual provider-shaped event</legend>
    <label>Provider category<select value={providerKind} onChange={e=>setProviderKind(e.target.value as ProviderCategory)}>{['paddle','stripe','payment-other','adsense','advertising-other','affiliate','woocommerce','commerce-other','lead-generation','digital-product','service-payment','manual'].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Provider ID<input value={providerId} maxLength={160} onChange={e=>setProviderId(e.target.value)}/></label>
    <label>Account ID<input value={providerAccount} maxLength={160} onChange={e=>setProviderAccount(e.target.value)}/></label>
    <label>Resource ID<input value={providerResource} maxLength={160} onChange={e=>setProviderResource(e.target.value)}/></label>
    <label>Source record ID<input value={sourceRecord} maxLength={160} onChange={e=>setSourceRecord(e.target.value)}/></label>
    <label>Unique source event ID<input value={sourceEvent} maxLength={160} onChange={e=>setSourceEvent(e.target.value)}/></label>
    <label>Import batch reference<input value={batch} maxLength={160} onChange={e=>setBatch(e.target.value)}/></label>
    <label>Lifecycle state<input value={providerState} maxLength={30} onChange={e=>setProviderState(e.target.value)}/></label>
    <label>Financial basis<select value={providerBasis} onChange={e=>setProviderBasis(e.target.value as ProviderRevenueEvent['basis'])}>{['gross','refund','fee','payout','estimate'].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Nonnegative amount in exact minor units<input type="number" min="0" step="1" value={providerAmount} onChange={e=>setProviderAmount(e.target.value)}/></label>
    <label>Currency code<input value={providerCurrency} maxLength={3} onChange={e=>setProviderCurrency(e.target.value.toUpperCase())}/></label>
    <label>Period from<input type="date" value={providerFrom} onChange={e=>setProviderFrom(e.target.value)}/></label>
    <label>Period through<input type="date" value={providerThrough} onChange={e=>setProviderThrough(e.target.value)}/></label>
    <label>Event time<input type="datetime-local" value={providerAt} onChange={e=>setProviderAt(e.target.value)}/></label>
    <label>Settlement or payout reference (blank = missing)<input value={providerSettlement} maxLength={160} onChange={e=>setProviderSettlement(e.target.value)}/></label>
    <label>Related local event ID for refund or fee<input value={relatedEvent} maxLength={120} onChange={e=>setRelatedEvent(e.target.value)}/></label>
    <button type="button" onClick={saveProvider}>Add unverified event locally</button></fieldset>}
   <p>Provider categories represented: {reconciliation?.providerCoverage.join(', ')||'Unavailable'}. {reconciliation?.rows.length??0} source record(s); {reconciliation?.exceptions.length??0} unresolved exception(s).</p>
   {reconciliation?.rows.length?<div className="revenueCards">{reconciliation.rows.map(row=><article key={row.recordKey}><strong>{row.provider} · {row.sourceRecordId}</strong>
    <p>{row.state} · {row.status} · settlement: {row.settlementReadiness} · {row.currency} · {row.periodFrom}–{row.periodThrough}. Amount and settled revenue: Unavailable.</p></article>)}</div>:<p>No provider-shaped events available.</p>}
   {reconciliation?.exceptions.length?<div className="revenueCards">{reconciliation.exceptions.map(x=><article key={x.id}><strong>{x.category} · {x.severity}</strong><p>{x.explanation}</p>
    <details><summary>Investigation checklist</summary><p>{x.investigation}</p><p>Event IDs: {x.eventIds.join(', ')}. Open local review; cannot be financially resolved here.</p></details></article>)}</div>:<p>No local exception detected. This does not certify provider settlement.</p>}
   <details><summary>Requirements for independent verification</summary><ul>{reconciliation?.requirements.map(x=><li key={x}>{x}</li>)}</ul></details>
   {canEdit&&<div className="revenueTransfer"><button type="button" disabled={!reconciliation?.exceptions.length} onClick={transferReconciliation}>Prepare reconciliation gap in product backlog</button>
    <label>Inspect provider package JSON (250 KB maximum)<input type="file" accept=".json,application/json" onChange={e=>void inspectProvider(e.target.files?.[0])}/></label>
    {pendingProvider&&<div role="group" aria-label="Confirm provider import"><p>Replace local provider preview with {pendingProvider.events.length} unverified event(s)?</p>
     <button type="button" onClick={()=>{if(!onProviderChange(pendingProvider)){setError('PROVIDER_SCOPE_CHANGED');return;}setPendingProvider(null);setNotice('Provider-shaped records replaced locally; no verification or settlement authority.');}}>Confirm local replacement</button>
     <button type="button" onClick={()=>setPendingProvider(null)}>Cancel</button></div>}
    <button type="button" disabled={!providerBundle} onClick={downloadProvider}>Export provider review JSON</button></div>}
   <h3>Manual conversion and retention review</h3>{current?.funnels.length?<div className="revenueCards">{current.funnels.map(f=>{const r=analyzeFunnel(f);return <article key={f.id}><strong>{f.from}–{f.through} · {f.source}</strong>
    <p>Signup: {r.signup===null?'Unavailable':(r.signup*100).toFixed(1)+'%'}; activation: {r.activation===null?'Unavailable':(r.activation*100).toFixed(1)+'%'}; checkout: {r.checkout===null?'Unavailable':(r.checkout*100).toFixed(1)+'%'}; cancellation: {r.cancellation===null?'Unavailable':(r.cancellation*100).toFixed(1)+'%'}.</p>
    <small>{r.provenance}. One source and period; not verified website performance.</small></article>;})}</div>:<p>No compatible funnel observations. Conversion rates unavailable.</p>}
   <h3>Competitor pricing and package limits</h3>{comparisons.length?<div className="revenueCards">{comparisons.map(c=><article key={c.claimId}><strong>Claim {c.claimId}</strong><p>Reported {c.reported?`${c.reported.currency} ${c.reported.minor} minor units / ${c.reported.period}`:'price unknown'}.
    Own proposed tiers: {c.ownProposals.map(x=>x.tier).join(', ')||'unknown'}. {c.limitation}.</p><small>Unverified source: {c.source} · {c.observedOn}. No exchange rate or regional equivalence assumed.</small></article>)}</div>:<p>No compatible, current local competitor claims. Prices unavailable.</p>}
   <h3>Review-only revenue opportunities</h3>{opportunities.length?<div className="revenueCards">{opportunities.map(o=><article key={o.id}><strong>{o.title}</strong>
    <p>Priority {o.priority} · {o.reason}. Cost and impact unknown. Confidence low. {o.risks.join('; ')}.</p>
    <small>{o.provenance} · evidence IDs {o.evidenceRefs.join(', ')}</small>
    <button type="button" disabled={!canEdit} onClick={()=>transfer(o.id)}>Prepare in product backlog</button></article>)}</div>:<p>No rule generated an opportunity. Missing evidence is not treated as a business gap.</p>}
   <h3>Hypothetical scenarios</h3>{current?.scenarios.length?<div className="revenueCards">{current.scenarios.map(s=>{const r=calculateRevenueScenario(s);return <article key={s.id}><strong>{s.kind}: {r.currency} {r.hypotheticalAdditionalMinor} minor units</strong><p>{r.formula}. {r.warning}</p><small>Assumption: {s.assumption}. Period {s.periodFrom}–{s.periodThrough}.</small></article>;})}</div>:<p>No scenarios. Actual revenue remains unavailable.</p>}
   <h3>Pricing experiment proposals</h3>{current?.experiments.length?<ul>{current.experiments.map(e=><li key={e.id}>{e.hypothesis} · {e.segment} · {e.state}; success: {e.successCriteria}; rollback: {e.rollback}.</li>)}</ul>:<p>No experiment proposals. Live prices unchanged.</p>}
   {canEdit&&<div className="revenueTransfer"><h3>Local review package</h3><label>Import JSON (250 KB maximum)<input type="file" accept=".json,application/json" onChange={e=>void inspect(e.target.files?.[0])}/></label>
    {pending&&<div role="group" aria-label="Confirm revenue import"><p>Replace current local review with {pending.funnels.length} funnels, {pending.scenarios.length} scenarios and {pending.experiments.length} experiments?</p>
     <button type="button" onClick={()=>{setPreview(pending);setPending(null);setNotice('Imported to browser memory only; all evidence remains unverified.');}}>Confirm local replacement</button><button type="button" onClick={()=>setPending(null)}>Cancel</button></div>}
    <button type="button" disabled={!current} onClick={download}>Export review-only JSON</button></div>}
  </>}
 </section>;
}
