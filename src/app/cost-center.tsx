'use client';
import { useEffect,useState } from 'react';
import { WebsiteBudgetPanel, type WebsiteBudgetRow } from './website-budget-panel';
export function CostCenter() {
  const [rows,setRows]=useState<WebsiteBudgetRow[]|null>(null); const [message,setMessage]=useState('Loading configured budgets…');
  useEffect(()=>{let active=true;
    async function load(){try{
      const scope=await fetch('/api/organizations/selection',{credentials:'include',cache:'no-store'});
      if(!scope.ok) throw Error(scope.status===403?'Select a workspace first.':'Budget scope unavailable.');
      const {organization}=await scope.json() as {organization:{id:string}};
      const response=await fetch('/api/admin/budgets?organizationId='+encodeURIComponent(organization.id),{credentials:'include',cache:'no-store'});
      if(!response.ok) throw Error('Configured budgets unavailable.');
      const data=await response.json() as {budgets:WebsiteBudgetRow[]};
      if(active){setRows(data.budgets);setMessage('');}
    }catch(error){if(active)setMessage(error instanceof Error?error.message:'Configured budgets unavailable.');}}
    void load(); return()=>{active=false;};
  },[]);
  return <section className="pageStack"><div className="panel"><h2>AI cost center</h2><p>Configured limits and weekly capacity only. Actual provider spend, forecasts and remaining balance are not available from this endpoint.</p></div>
    {message&&<p role="status">{message}</p>}{rows&&<WebsiteBudgetPanel rows={rows}/>}</section>;
}
