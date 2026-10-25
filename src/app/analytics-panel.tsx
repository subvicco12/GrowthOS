'use client';
import { useEffect,useState } from 'react';
import { compareReportingPeriods,performanceOpportunities,periodBuckets,summarizeAnalytics,type AnalyticsObservation } from '../core/offline-analytics';
import { exportAnalytics,exportAnalyticsCsv,importAnalytics,type AnalyticsPackage } from '../core/offline-analytics-transfer';
import { workspaceError } from './workspace-response';
import { providerCapabilities } from '../core/analytics-provider-catalog';
type Site={id:string;domain:string};
type Page={websites:Site[];nextCursor:string|null;organization:{id:string;role:string}};
const display=(n:number|null,unit='')=>n===null?'Unavailable':new Intl.NumberFormat().format(n)+unit;
const percent=(n:number|null)=>n===null?'Unavailable':(n*100).toFixed(2)+'%';
const money=(n:number|null,currency:string|null)=>n===null||!currency?'Unavailable':`${currency} ${(n/100).toFixed(2)} (reported)`;
export function AnalyticsPanel(){
 const [sites,setSites]=useState<Site[]>([]),[org,setOrg]=useState(''),[role,setRole]=useState('viewer');
 const [status,setStatus]=useState('Loading website scope…'),[rows,setRows]=useState<AnalyticsObservation[]>([]);
 const [siteId,setSiteId]=useState(''),[from,setFrom]=useState(''),[through,setThrough]=useState('');
 const [frequency,setFrequency]=useState<'daily'|'weekly'|'monthly'>('daily');
 const [pending,setPending]=useState<AnalyticsPackage|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void (async()=>{try{let cursor:string|null=null,organization='',userRole='viewer';const found:Site[]=[];
   do{const response=await fetch('/api/organization-websites'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{credentials:'include',cache:'no-store'});
     if(!response.ok)throw workspaceError(response,'Analytics website scope');const page=await response.json() as Page;
     if(organization&&organization!==page.organization.id)throw Error('Workspace changed; reload to continue.');
     organization=page.organization.id;userRole=page.organization.role;found.push(...page.websites);cursor=page.nextCursor;
     if(found.length>250)throw Error('Website list exceeds local reporting limit.');
   }while(cursor&&active);
   if(active){setSites(found);setOrg(organization);setRole(userRole);setStatus(found.length?'No analytics imported. Live analytics are unavailable.':'No websites available.');}
  }catch(e){if(active)setStatus(e instanceof Error?e.message:'Website scope unavailable.');}})();return()=>{active=false;};},[]);
 const scope={organizationId:org,websiteIds:siteId?[siteId]:sites.map(s=>s.id)};
 const canImport=!!org&&scope.websiteIds.length>0&&['owner','admin','editor'].includes(role);
 const selected=rows.filter(r=>scope.websiteIds.includes(r.websiteId));
 const dates=selected.map(r=>r.day).sort();const start=from||dates[0]||'',end=through||dates.at(-1)||'';
 let summary:ReturnType<typeof summarizeAnalytics>|null=null,buckets:ReturnType<typeof periodBuckets>=[];
 let comparison:ReturnType<typeof compareReportingPeriods>|null=null,opportunities:ReturnType<typeof performanceOpportunities>=[];
 if(start&&end&&org&&scope.websiteIds.length&&start<=end){try{summary=summarizeAnalytics(selected,{...scope,from:start,through:end});
   buckets=periodBuckets(selected,{...scope,from:start,through:end},frequency);
   comparison=compareReportingPeriods(selected,{...scope,from:start,through:end});
   opportunities=performanceOpportunities(selected,{...scope,from:start,through:end});}catch(e){if(!error)void e;}}
 function download(content:string,name:string,mime:string){const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 async function inspect(file:File|undefined){setPending(null);if(!file)return;try{if(!canImport)throw Error('ANALYTICS_IMPORT_ROLE_DENIED');
   if(file.size>500_000)throw Error('ANALYTICS_IMPORT_SIZE_DENIED');const pkg=importAnalytics(new Uint8Array(await file.arrayBuffer()),scope);
   setPending(pkg);setError('');setStatus(`Preview: ${pkg.observations.length} unverified observations across ${pkg.websiteIds.length} website(s). Existing local observations unchanged.`);
  }catch(e){setError(e instanceof Error?e.message:'Import refused');}}
 function exportFile(kind:'json'|'csv'){try{if(!org||!scope.websiteIds.length)throw Error('ANALYTICS_SCOPE_UNAVAILABLE');
   const content=kind==='json'?exportAnalytics(selected,scope):exportAnalyticsCsv(selected,scope);
   download(content,'growthos-offline-analytics.'+kind,kind==='json'?'application/json':'text/csv');setError('');
  }catch(e){setError(e instanceof Error?e.message:'Export unavailable');}}
 function template(){try{if(!canImport)throw Error('ANALYTICS_IMPORT_ROLE_DENIED');const at=new Date().toISOString();
   const example:AnalyticsObservation={id:crypto.randomUUID(),organizationId:org,websiteId:scope.websiteIds[0],source:'synthetic-template',
     sourceKind:'synthetic-fixture',observedAt:at,day:at.slice(0,10),visitorDefinition:'sessions',attribution:'unattributed',
     currency:null,channel:null,landingPage:null,contentId:null,campaignId:null,visits:null,engagedVisits:null,conversions:null,
     searchImpressions:null,searchClicks:null,revenueMinor:null,spendMinor:null,costKind:null,revenueKind:null,settled:false};
   download(exportAnalytics([example],scope),'growthos-synthetic-analytics-template.json','application/json');setError('');
  }catch(e){setError(e instanceof Error?e.message:'Template unavailable');}}
 const group=(key:'channel'|'campaignId'|'contentId')=>[...new Set(selected.map(r=>r[key]).filter((v):v is string=>typeof v==='string'))]
   .slice(0,30).map(value=>({value,count:selected.filter(r=>r[key]===value).length}));
 return <section className="panel analyticsPanel" aria-label="Offline analytics and performance">
  <h2>Analytics & Performance</h2><p>Validated manual imports only. No analytics provider is connected. Imported figures are unverified reports, never settled payment or verified website performance.</p>
  <p role="status">{status}</p>
  <details><summary>Connector and evidence trust status</summary>
   <p>No analytics connector is active. Configuration, imported reports and successful API responses do not prove account ownership, current permissions, integrity or independent verification. This workspace accepts only local unverified or synthetic observations.</p>
   <div className="analyticsTable"><table><caption>Provider contracts prepared; collection disabled</caption><thead><tr><th scope="col">Provider category</th><th scope="col">Required scope</th><th scope="col">Status</th></tr></thead><tbody>
    {Object.entries(providerCapabilities).map(([kind,scopes])=><tr key={kind}><th scope="row">{kind}</th><td>{scopes.join(', ')}</td><td>Unavailable · no trusted connection</td></tr>)}
   </tbody></table></div>
   <p>Trust progression: synthetic or manual → imported unverified → provider reported → provider authenticated → independently verified. Each step needs current scoped evidence; revocation or missing authority blocks promotion. No local package carries approval, payment settlement or publishing authority.</p>
  </details>{error&&<p role="alert">{error}</p>}
  <div className="analyticsControls"><label>Website<select value={siteId} onChange={e=>{setSiteId(e.target.value);setPending(null);setFrom('');setThrough('');}}>
    <option value="">Portfolio · compatible measurements only</option>{sites.map(s=><option key={s.id} value={s.id}>{s.domain}</option>)}</select></label>
    <label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>Through<input type="date" value={through} onChange={e=>setThrough(e.target.value)}/></label>
    <label>Trend period<select value={frequency} onChange={e=>setFrequency(e.target.value as typeof frequency)}><option value="daily">Daily</option><option value="weekly">Weekly (UTC Monday)</option><option value="monthly">Monthly (UTC)</option></select></label></div>
  {summary?<><div className="analyticsCards">
    <article><span>Visits ({summary.visitorDefinition??'unknown definition'})</span><strong>{display(summary.visits)}</strong></article>
    <article><span>Conversions</span><strong>{display(summary.conversions)}</strong><small>Rate: {percent(summary.conversionRate)}</small></article>
    <article><span>Search clicks / impressions</span><strong>{display(summary.searchClicks)} / {display(summary.searchImpressions)}</strong><small>CTR: {percent(summary.searchCtr)}</small></article>
    <article><span>Attributed revenue</span><strong>{money(summary.revenueMinor,summary.currency)}</strong></article>
    <article><span>Reported cost</span><strong>{money(summary.spendMinor,summary.currency)}</strong></article>
    <article><span>ROI / ROAS</span><strong>{percent(summary.roi)} / {summary.roas===null?'Unavailable':summary.roas.toFixed(2)+'×'}</strong><small>Cost per conversion: {money(summary.costPerConversion,summary.currency)}</small></article>
   </div><p>Period: {start} to {end}; {summary.observationCount} observations. Attribution: {summary.attribution??'unavailable'}. Provenance: {summary.provenance}.</p>
   <ul>{summary.warnings.map(w=><li key={w}>{w}</li>)}</ul>
   <h3>Previous comparable period</h3><p>{comparison?.comparable?
    `Visits change: ${display(comparison.visitChange)}; conversions change: ${display(comparison.conversionChange)}. Previous ${comparison.previous.scope.from} to ${comparison.previous.scope.through}.`:
    'Unavailable: previous-period coverage or comparable currency, visitor definition and attribution are missing.'}</p>
   <h3>Traffic trend</h3><div className="analyticsTable"><table><caption>{frequency} imported counts; missing values are unavailable</caption><thead><tr><th scope="col">Period</th><th scope="col">Visits</th><th scope="col">Conversions</th><th scope="col">Search clicks</th></tr></thead>
    <tbody>{buckets.map(b=><tr key={b.period}><th scope="row">{b.period}</th><td>{display(b.visits)}</td><td>{display(b.conversions)}</td><td>{display(b.searchClicks)}</td></tr>)}</tbody></table></div>
   <h3>Website comparison</h3><div className="analyticsCards">{summary.byWebsite.map(w=><article key={w.websiteId}>
    <strong>{sites.find(s=>s.id===w.websiteId)?.domain??w.websiteId}</strong><p>{w.count} observations · {display(w.visits)} visits · {display(w.conversions)} conversions</p></article>)}</div>
   {(['channel','campaignId','contentId'] as const).map(key=><div key={key}><h3>{key==='channel'?'Acquisition channels':key==='campaignId'?'Campaign attribution':'Measured content references'}</h3>
     <ul>{group(key).map(g=><li key={g.value}>{g.value}: {g.count} unverified observations</li>)}</ul>
     {!group(key).length&&<p>Unavailable. Local campaign and draft previews are not published or measured content.</p>}</div>)}
   <h3>Performance-linked review ideas</h3>{opportunities.length?<ul>{opportunities.map(o=><li key={o.category}>
     <strong>{o.category}</strong> · priority {o.priority} (deterministic rule). {o.reason}. {o.action}
     <small> Unverified evidence IDs: {o.evidenceIds.join(', ')}. Impact and cost unknown; review only.</small></li>)}</ul>:
     <p>No evidence-backed rule produced an opportunity. No uplift projection is available.</p>}
  </>:<p className="emptyState">Choose a valid period and import scoped observations to view performance. Missing values stay unavailable.</p>}
  <div className="analyticsTransfer"><h3>Offline import and export</h3>
    <p>Only owner, admin or editor can preview local imports. Confirmation replaces browser-memory observations for the selected scope. No server mutation occurs.</p>
    <label>Choose versioned JSON (500 KB maximum)<input type="file" accept=".json,application/json" disabled={!canImport}
      onChange={e=>void inspect(e.target.files?.[0])}/></label>
    {pending&&<div role="group" aria-label="Confirm analytics import"><p>Replace {selected.length} local observations with {pending.observations.length} unverified observations?</p>
      <button type="button" onClick={()=>{setRows(old=>[...old.filter(r=>!scope.websiteIds.includes(r.websiteId)),...pending.observations]);setPending(null);setStatus('Imported into browser memory only; verification unavailable.');}}>Replace local observations</button>
      <button type="button" className="secondary" onClick={()=>setPending(null)}>Cancel</button></div>}
    <div className="studioActions"><button type="button" onClick={()=>exportFile('json')}>Export JSON</button><button type="button" onClick={()=>exportFile('csv')}>Export safe CSV</button></div>
    <button type="button" className="secondary" disabled={!canImport} onClick={template}>Download synthetic empty-metric template</button>
   </div>
 </section>;
}
