'use client';
import { useEffect,useState } from 'react';
type Approval={id:string;website_id:string;title:string;action_type:string;status:string;created_at:string};
type Decision='approved'|'rejected'|'deferred';
export function OrganizationApprovalInbox(){
  const [items,setItems]=useState<Approval[]>([]);const [organization,setOrganization]=useState<{id:string;role:string}|null>(null);
  const [message,setMessage]=useState('Loading pending approvals…');const [selected,setSelected]=useState<{item:Approval;decision:Decision;key:string}|null>(null);
  const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
  async function load(){
    const [scope,response]=await Promise.all([
      fetch('/api/organizations/selection',{credentials:'include',cache:'no-store'}),
      fetch('/api/organization-approvals',{credentials:'include',cache:'no-store'})
    ]);
    if(!scope.ok||!response.ok)throw Error(scope.status===403||response.status===403?'Select an authorized workspace.':'Approval inbox unavailable.');
    const current=await scope.json() as {organization:{id:string;role:string}};
    const data=await response.json() as {items:Approval[]};
    setOrganization(current.organization);setItems(data.items);setMessage('');
  }
  useEffect(()=>{void load().catch(error=>setMessage(error instanceof Error?error.message:'Approval inbox unavailable.'));},[]);
  function choose(item:Approval,decision:Decision){setSelected({item,decision,key:crypto.randomUUID()});setNote('');setMessage('');}
  async function submit(){if(!selected||!organization)return;
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/admin/approvals/decide',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:organization.id,websiteId:selected.item.website_id,approvalId:selected.item.id,idempotencyKey:selected.key,decision:selected.decision,note})});
      if(!response.ok)throw Error(response.status===409?'Decision conflicted with an existing decision. Refresh the inbox.':response.status===403?'Your role cannot decide this approval.':'Decision unavailable.');
      const result=await response.json() as {externalAction:boolean;replay:boolean};
      if(result.externalAction!==false)throw Error('Unexpected external action response. Stop and review.');
      setSelected(null);await load();setMessage(result.replay?'Previous internal decision confirmed. No external action.':'Internal decision recorded. No publishing or external action started.');
    }catch(error){setMessage(error instanceof Error?error.message:'Decision unavailable.');}
    finally{setBusy(false);}
  }
  const canDecide=organization&&['owner','admin','editor'].includes(organization.role);
  return <section className="panel" aria-label="Organization approval inbox"><div className="panelHead"><div><h2>Internal approval inbox</h2><p>Decisions update internal records only. Publishing and external actions remain unavailable.</p></div><span className="engineCount">{items.length} pending</span></div>
    {message&&<p role="status">{message}</p>}
    <div className="approvalList">{items.map(item=><article className="approvalCard" key={item.id}><div className="approvalSummary"><span><strong>{item.title}</strong><small>{item.action_type} · Website {item.website_id}</small></span><span>Pending</span></div>
      {canDecide&&<div className="approvalActions" role="group" aria-label={'Decide '+item.title}><button type="button" onClick={()=>choose(item,'approved')}>Approve internally</button><button type="button" className="secondary" onClick={()=>choose(item,'rejected')}>Reject</button><button type="button" className="secondary" onClick={()=>choose(item,'deferred')}>Defer</button></div>}
    </article>)}{!items.length&&!message&&<p className="emptyState">No pending internal approvals.</p>}</div>
    {selected&&<div className="confirmation" role="group" aria-label="Confirm internal decision"><h3>Confirm {selected.decision}: {selected.item.title}</h3><p>This changes an internal decision record. It does not publish or activate automation.</p><label htmlFor="decision-note">Optional note</label><textarea id="decision-note" maxLength={2000} value={note} onChange={event=>setNote(event.target.value)}/>
      <button type="button" disabled={busy} onClick={()=>void submit()}>{busy?'Saving…':'Confirm internal decision'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>setSelected(null)}>Cancel</button></div>}
  </section>;
}
