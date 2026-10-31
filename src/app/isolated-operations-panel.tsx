'use client';
import { useEffect, useRef, useState } from 'react';
import type { WebsiteSummary } from '../core/workspace-journey';
import { workspaceError } from './workspace-response';
type Stream='jobs'|'recommendations'|'events'|'attempts';
type Item={id:string;source_label?:string;title?:string;status?:string;error_code?:string;approval_id?:string;event_type?:string;recordedAt:string;input_hash?:string;provenance?:string;fence?:number};
type Overview={ownership:{state:string;validUntil:string|null;epoch:number};connector:{state:string;health_state:string;fingerprint:string;endpoint:string}|null;
 counts:{status:string;total:number}[];expiredLeases:number;externalSpendMinor:string;mode:string};
export function IsolatedOperationsPanel({organizationId,site,role,onAccessDenied}:{organizationId:string;site:WebsiteSummary;role:string;onAccessDenied:()=>void}){
 const [overview,setOverview]=useState<Overview|null>(null),[items,setItems]=useState<Item[]>([]),[stream,setStream]=useState<Stream>('jobs');
 const [cursor,setCursor]=useState<string|null>(null),[message,setMessage]=useState('Loading isolated operations…'),[busy,setBusy]=useState(false),[unavailable,setUnavailable]=useState(false);
 const [endpoint,setEndpoint]=useState(`https://${site.domain}/wp-json/growthos/v1/health`);
 const lock=useRef(false),active=useRef(false),controller=useRef<AbortController|null>(null),denied=useRef(onAccessDenied);denied.current=onAccessDenied;
 const admin=['owner','admin'].includes(role),scope={organizationId,websiteId:site.id};
 async function response(r:Response):Promise<Record<string,any>>{
  if(r.status===401||r.status===403){setOverview(null);setItems([]);denied.current();throw workspaceError(r,'Operations');}
  const data=await r.json();if(!r.ok){if(r.status===501){setUnavailable(true);throw Error('Isolated Session 03 proposal 018 is not enabled. Existing workspaces remain available.');}throw Error(r.status>=500?'Operation outcome unavailable. Refresh records before retrying.':String(data.code||'Operation refused'));}
  if(data.ok!==true||data.organizationId!==organizationId||data.websiteId!==site.id)throw Error('Operations scope changed. Reload this workspace.');return data;
 }
 async function fetchPage(selected:Stream,signal:AbortSignal,next?:string){
  const data=await response(await fetch('/api/isolated-operations?'+new URLSearchParams({...scope,stream:selected,...(next?{cursor:next}:{})}),{credentials:'include',cache:'no-store',signal}));
  if(data.stream!==selected||!Array.isArray(data.items)||data.items.length>25||!(data.nextCursor===null||typeof data.nextCursor==='string')||data.nextCursor===next)throw Error('Operations page could not be verified.');
  return data;
 }
 async function load(selected:Stream=stream,next?:string){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');const abort=new AbortController();controller.current=abort;
  try{
   const [summary,page]=await Promise.all([response(await fetch('/api/isolated-operations?'+new URLSearchParams({...scope,stream:'overview'}),{credentials:'include',cache:'no-store',signal:abort.signal})),fetchPage(selected,abort.signal,next)]);
   if(!active.current||abort.signal.aborted)return;
   setOverview(summary as Overview);setItems(old=>next?[...old,...page.items.filter((item:Item)=>!old.some(row=>row.id===item.id))]:page.items);setCursor(page.nextCursor);setStream(selected);setUnavailable(false);
  }catch(error){if(active.current&&!abort.signal.aborted)setMessage(error instanceof Error?error.message:'Operations unavailable.');}
  finally{if(active.current&&!abort.signal.aborted){lock.current=false;setBusy(false);}}
 }
 useEffect(()=>{active.current=true;lock.current=false;void load('jobs');return()=>{active.current=false;controller.current?.abort();};},[organizationId,site.id]);
 async function mutate(action:string,extra:Record<string,string>={}){
  if(lock.current||unavailable)return;lock.current=true;setBusy(true);setMessage('');const abort=new AbortController();controller.current=abort;
  try{const data=await response(await fetch('/api/isolated-operations',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...scope,action,...extra}),signal:abort.signal}));
   if(!active.current||abort.signal.aborted)return;if(data.externalAction!==false)throw Error('Unexpected external action. Stop and review.');
   setMessage('Isolated operation recorded. Refresh operations to inspect current state. No external automation was started.');
  }catch(error){if(active.current&&!abort.signal.aborted)setMessage(error instanceof Error?error.message:'Operation unavailable.');}
  finally{if(active.current&&!abort.signal.aborted){lock.current=false;setBusy(false);}}
 }
 function revoke(approvalId:string){const reason=window.prompt('Reason for revoking this internal approval (does not undo completed results)');if(reason?.trim())void mutate('revoke_approval',{approvalId,reason:reason.trim()});}
 return <section className="panel isolatedWorkflow" aria-label="Leased workers and connector operations"><h3>Leased workers and connector operations</h3>
  <p>Session 03 is isolated-development only. Connector health is a local authenticated simulation; background workers process manual observations without network requests or AI spending.</p>
  {message&&<p role="status">{message}</p>}<button type="button" disabled={busy} className="secondary" onClick={()=>void load()}>Refresh operations</button>
  {overview&&<>
   <h4>Tenant-scoped operational status</h4><p>Ownership authority: <strong>{overview.ownership.state}</strong> · epoch {overview.ownership.epoch}{overview.ownership.validUntil?' · valid until '+new Date(overview.ownership.validUntil).toLocaleString():''}</p>
   <p>{overview.counts.map(row=>`${row.status}: ${row.total}`).join(' · ')||'No analysis jobs'} · expired leases: {overview.expiredLeases} · external spend: {overview.externalSpendMinor}</p>
   <p>Connector: {overview.connector?`${overview.connector.state} · ${overview.connector.health_state}`:'not enrolled'}. This is not a production WordPress health result.</p>
   {admin&&<>
    <div className="websiteControls"><button type="button" disabled={busy} onClick={()=>void mutate('tick')}>Run one synthetic worker cycle</button><button type="button" disabled={busy} onClick={()=>void mutate('recover')}>Recover expired leases</button>
     <button type="button" disabled={busy} onClick={()=>void mutate('expire_ownership')}>Apply expired ownership</button><button type="button" disabled={busy||overview.ownership.state!=='current'} onClick={()=>void mutate('revoke_ownership')}>Revoke ownership authority</button></div>
    <label className="registryFilter">Read-only synthetic connector endpoint<input value={endpoint} maxLength={2048} onChange={event=>setEndpoint(event.target.value)}/></label>
    <div className="websiteControls"><button type="button" disabled={busy||overview.ownership.state!=='current'} onClick={()=>void mutate('enroll',{endpoint,mode:'synthetic_readonly'})}>Enroll synthetic read-only connector</button>
     <button type="button" disabled={busy||overview.connector?.state!=='enrolled'} onClick={()=>void mutate('health')}>Check authenticated synthetic health</button>
     <button type="button" disabled={busy||overview.connector?.state!=='enrolled'} onClick={()=>void mutate('revoke_connector')}>Revoke synthetic enrollment</button></div>
   </>}
   <div className="registryFilter"><label htmlFor={"operations-stream-"+site.id}>Operations history stream</label><select id={"operations-stream-"+site.id} value={stream} disabled={busy} onChange={event=>void load(event.target.value as Stream)}>
    <option value="jobs">Jobs and failure monitoring</option><option value="recommendations">Recommendations and provenance</option><option value="events">Workflow audit events</option><option value="attempts">Worker execution attempts</option></select></div>
   <p>{items.length} loaded records{cursor?' · older pages available':''}. Research provenance is manual and unverified.</p>
   {!items.length&&<p>No records in this operations stream.</p>}
   {items.map(item=><article className="auditEntry" key={item.id}><strong>{item.source_label||item.title||item.event_type||item.id}</strong>
    <p>{item.status||item.event_type} · {new Date(item.recordedAt).toLocaleString()}</p>{item.error_code&&<p role="status">Failure: {item.error_code}</p>}
    {item.input_hash&&<p>Source hash: <code>{item.input_hash}</code> · {item.provenance||'UNVERIFIED_MANUAL_INPUT'}</p>}
    {item.fence!==undefined&&<p>Lease fence: {item.fence}</p>}
    {admin&&stream==='jobs'&&<div className="websiteControls">{!['completed','cancelled'].includes(item.status||'')&&<button type="button" disabled={busy} onClick={()=>void mutate('cancel',{jobId:item.id})}>Cancel leased job</button>}
     {item.approval_id&&<button type="button" disabled={busy} onClick={()=>revoke(item.approval_id!)}>Revoke job approval</button>}</div>}
   </article>)}
   {cursor&&<button type="button" className="secondary" disabled={busy} onClick={()=>void load(stream,cursor)}>Load older operations</button>}
  </>}
 </section>;
}
