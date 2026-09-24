export type AutomationLevel='green'|'amber'|'red';
export interface AutomationPolicy { level:AutomationLevel; requiresApproval:boolean; reversible:boolean; description:string; }
export const AUTOMATION_POLICIES:Record<AutomationLevel,AutomationPolicy>={
 green:{level:'green',requiresApproval:false,reversible:true,description:'Deterministic scans, QA, monitoring, analytics ingestion and reports'},
 amber:{level:'amber',requiresApproval:true,reversible:true,description:'Content, social, SEO edits, package changes and GitHub PR preparation'},
 red:{level:'red',requiresApproval:true,reversible:false,description:'Pricing/payment changes, ad spend, destructive actions and major production changes'},
};
export function policyFor(level:AutomationLevel):AutomationPolicy{return AUTOMATION_POLICIES[level];}
export function assertAutomationAllowed(level:AutomationLevel,approved:boolean):void{
 if(AUTOMATION_POLICIES[level].requiresApproval&&!approved)throw new Error('APPROVAL_REQUIRED');
}
