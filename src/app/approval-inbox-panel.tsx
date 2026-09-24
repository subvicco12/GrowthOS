'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildApprovalInboxViewModel, type ApprovalInboxViewModel } from '../core/approval-inbox-view';
import { approvalRequest } from '../core/approval-request';
export function ApprovalInboxPanel({items,onAction}:{items:ApprovalInboxViewModel[];onAction?:(id:string,action:'approve'|'reject'|'defer')=>void}){
 const [selected,setSelected]=useState<ApprovalInboxViewModel|null>(null);
 const [busy,setBusy]=useState<string|null>(null);
 const [feedback,setFeedback]=useState<string>('');
 const [pending,setPending]=useState<{id:string;action:'approve'|'reject'|'defer'}|null>(null);\n const cancelRef=useRef<HTMLButtonElement|null>(null);\n useEffect(()=>{if(pending)cancelRef.current?.focus()},[pending]);
 const models=useMemo(()=>buildApprovalInboxViewModel(items),[items]);
 async function act(id:string,action:'approve'|'reject'|'defer'){
  if(onAction){onAction(id,action);return;}
  setBusy(id); setFeedback('');
  try{
   const payload=approvalRequest({recommendationId:id,action,idempotencyKey:crypto.randomUUID()});
   const response=await fetch('/api/approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.code||'APPROVAL_REQUEST_FAILED');
   setFeedback(`${action} recorded successfully.`); setSelected(null);
  }catch(error){setFeedback(error instanceof Error?error.message:'APPROVAL_REQUEST_FAILED');}
  finally{setBusy(null);}
 }
 return <section className="panel" aria-labelledby="approval-inbox-title">
  <div className="panelHead"><div><h2 id="approval-inbox-title">Approval Inbox</h2><p>Only recommendations requiring human decisions appear here.</p></div><span className="engineCount">{models.length} pending</span></div>
  {feedback&&<p className="approvalFeedback" role="status">{feedback}</p>}
  {pending&&<div className="approvalConfirm" role="alertdialog" aria-modal="true" aria-label="Confirm recommendation decision"><p>Confirm <strong>{pending.action}</strong>. This records a human decision in GrowthOS and cannot be treated as a preview.</p><div className="approvalActions"><button type="button" disabled={busy===pending.id} onClick={()=>{const decision=pending;setPending(null);void act(decision.id,decision.action)}}>Confirm {pending.action}</button><button ref={cancelRef} type="button" disabled={busy===pending.id} onClick={()=>setPending(null)}>Cancel</button></div></div>}
  {models.length===0?<p className="emptyState">No approval decisions pending.</p>:<div className="approvalList">
   {models.map(item=><article className="approvalCard" key={item.id}>
    <button className="approvalSummary" type="button" onClick={()=>setSelected(item)} aria-expanded={selected?.id===item.id}><span><strong>{item.title}</strong><small>{item.category} · {item.siteId}</small></span><span>{item.approvalClass.toUpperCase()} · {item.score.toFixed(2)}</span></button>
    {selected?.id===item.id&&<div className="approvalDetail"><div className="detailGrid"><span>Impact <b>{item.impact}</b></span><span>Confidence <b>{item.confidence}</b></span><span>Effort <b>{item.effort}</b></span><span>Risk <b>{item.risk}</b></span></div><h3>Evidence</h3><ul>{item.evidence.slice(0,8).map((e,i)=><li key={i}>{e}</li>)}</ul><div className="approvalActions">{item.actions.map(action=><button key={action} type="button" disabled={busy===item.id} onClick={()=>setPending({id:item.id,action})}>{busy===item.id?'Working…':action[0].toUpperCase()+action.slice(1)}</button>)}</div></div>}
   </article>)}
  </div>}
 </section>;
}
