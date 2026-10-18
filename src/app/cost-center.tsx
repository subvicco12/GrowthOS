'use client';
import { useEffect,useState } from 'react';
import { WebsiteBudgetPanel, type WebsiteBudgetRow } from './website-budget-panel';
import { workspaceError } from './workspace-response';
export function CostCenter() {
  const [rows,setRows]=useState<WebsiteBudgetRow[]|null>(null); const [message,setMessage]=useState('Loading configured budgets…');
  useEffect(()=>{let active=true;
    async function load(){try{
      const scope=await fetch('/api/organizations/selection',{credentials:'include',cache:'no-store'});
      if(!scope.ok) throw workspaceError(scope,'Budget scope');
      const {organization}=await scope.json() as {organization:{id:string}};
      const [response,costs]=await Promise.all([
        fetch('/api/admin/budgets?organizationId='+encodeURIComponent(organization.id),{credentials:'include',cache:'no-store'}),
        fetch('/api/organization-costs',{credentials:'include',cache:'no-store'})
      ]);
      if(!response.ok) throw workspaceError(response,'Configured budgets');
      if(!costs.ok) throw workspaceError(costs,'Recorded costs');
      const data=await response.json() as {budgets:WebsiteBudgetRow[]};
      const ledger=await costs.json() as {recordedCompletedCosts:{websiteId:string;recordedMinor:string;completedCount:number}[]};
      const byWebsite=new Map(ledger.recordedCompletedCosts.map(x=>[x.websiteId,x]));
      if(active){setRows(data.budgets.map(row=>({...row,recordedCompletedMinor:byWebsite.get(row.websiteId)?.recordedMinor,completedReservationCount:byWebsite.get(row.websiteId)?.completedCount})));setMessage('');}
    }catch(error){if(active)setMessage(error instanceof Error?error.message:'Configured budgets unavailable.');}}
    void load(); return()=>{active=false;};
  },[]);
  return <section className="pageStack"><div className="panel"><h2>AI cost center</h2><p>Configured limits and persisted completed reservation costs for the current UTC month. Provider billed spend, currency, forecasts and remaining balance remain unavailable.</p></div>
    {message&&<p role="status">{message}</p>}{rows&&<WebsiteBudgetPanel rows={rows}/>}</section>;
}
