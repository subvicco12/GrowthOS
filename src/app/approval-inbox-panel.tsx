'use client';
import { useMemo, useState } from 'react';
import { buildApprovalInboxViewModel, type ApprovalInboxViewModel } from '../core/approval-inbox-view';
export function ApprovalInboxPanel({items,onAction}:{items:ApprovalInboxViewModel[];onAction?:(id:string,action:'approve'|'reject'|'defer')=>void}){
 const [selected,setSelected]=useState<ApprovalInboxViewModel|null>(null);
 const models=useMemo(()=>buildApprovalInboxViewModel(items),[items]);
 return <section className="panel" aria-labelledby="approval-inbox-title">
  <div className="panelHead"><div><h2 id="approval-inbox-title">Approval Inbox</h2><p>Only recommendations requiring human decisions appear here.</p></div><span className="engineCount">{models.length} pending</span></div>
  {models.length===0?<p className="emptyState">No approval decisions pending.</p>:<div className="approvalList">
   {models.map(item=><article className="approvalCard" key={item.id}>
    <button className="approvalSummary" type="button" onClick={()=>setSelected(item)} aria-expanded={selected?.id===item.id}><span><strong>{item.title}</strong><small>{item.category} · {item.siteId}</small></span><span>{item.approvalClass.toUpperCase()} · {item.score.toFixed(2)}</span></button>
    {selected?.id===item.id&&<div className="approvalDetail"><div className="detailGrid"><span>Impact <b>{item.impact}</b></span><span>Confidence <b>{item.confidence}</b></span><span>Effort <b>{item.effort}</b></span><span>Risk <b>{item.risk}</b></span></div><h3>Evidence</h3><ul>{item.evidence.slice(0,8).map((e,i)=><li key={i}>{e}</li>)}</ul><div className="approvalActions">{item.actions.map(action=><button key={action} type="button" onClick={()=>onAction?.(item.id,action)}>{action[0].toUpperCase()+action.slice(1)}</button>)}</div></div>}
   </article>)}
  </div>}
 </section>;
}
