'use client';
import { useEffect,useState } from 'react';
type Entry={id:string;website_id:string;actor_id:string;created_at:string;feature?:string;decision?:string};
export function GovernancePanel(){
  const [features,setFeatures]=useState<Entry[]>([]);const [decisions,setDecisions]=useState<Entry[]>([]);
  const [message,setMessage]=useState('Loading audit history…');
  useEffect(()=>{let active=true;fetch('/api/organization-governance',{credentials:'include',cache:'no-store'})
    .then(async response=>{if(!response.ok)throw Error(response.status===403?'Select an authorized workspace.':'Audit history unavailable.');return response.json() as Promise<{features:Entry[];decisions:Entry[]}>;})
    .then(data=>{if(active){setFeatures(data.features);setDecisions(data.decisions);setMessage('');}})
    .catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Audit history unavailable.');});return()=>{active=false;};},[]);
  return <section className="pageStack" aria-label="Governance"><div className="panel"><h2>Governance and audit</h2><p>Read-only latest 100 entries per type. These records do not describe all possible activity.</p>{message&&<p role="status">{message}</p>}</div>
    <section className="panel"><h3>Feature shutdowns</h3>{features.length?features.map(x=><p key={x.id}>{x.feature} disabled · Website {x.website_id} · {new Date(x.created_at).toLocaleString()}</p>):!message&&<p>No feature shutdown records in this view.</p>}</section>
    <section className="panel"><h3>Internal decisions</h3>{decisions.length?decisions.map(x=><p key={x.id}>{x.decision} · Website {x.website_id} · {new Date(x.created_at).toLocaleString()}</p>):!message&&<p>No decision records in this view.</p>}</section>
  </section>;
}
