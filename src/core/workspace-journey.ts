export type WebsiteSummary={id:string;domain:string;status:string;platform:string;verifiedAt:string|null;
 automationEnabled:boolean;autoPublishEnabled:boolean;monthlyBudgetMinor:string};
export type WebsiteScope={organizationId:string;websites:WebsiteSummary[]};
export function requireSelectedWebsite(scope:WebsiteScope,websiteId:string){
 if(!scope.organizationId||scope.websites.length>250||new Set(scope.websites.map(s=>s.id)).size!==scope.websites.length)throw Error('WORKSPACE_SCOPE_UNAVAILABLE');
 const site=scope.websites.find(s=>s.id===websiteId);if(!site)throw Error('WORKSPACE_WEBSITE_DENIED');return site;
}
export function onboardingReadiness(site:WebsiteSummary){
 const checks=[{name:'Draft registration',state:site.status==='draft'?'draft':'recorded'},
  {name:'Ownership verification',state:site.verifiedAt?'recorded':'unavailable'},
  {name:'Feature inventory',state:'manual-review-required'},
  {name:'Analytics connector',state:'unavailable'},
  {name:'Competitor research',state:'manual-preview-available'},
  {name:'Growth intelligence',state:'manual-preview-available'},
  {name:'Automation',state:site.automationEnabled?'switch-reported-on':'disabled'},
  {name:'Publishing',state:site.autoPublishEnabled?'switch-reported-on':'disabled'},
  {name:'Budget authority',state:'unavailable'}] as const;
 return {websiteId:site.id,checks,warnings:[...(!site.verifiedAt?['Website ownership is not verified']:[]),
  ...(site.automationEnabled||site.autoPublishEnabled?['Feature switch is reported on; this interface does not activate it']:[]),
  'Connector, entitlement and budget authority need separate certification']};
}
export type JourneySection='websites'|'intelligence'|'competitors'|'recommendations'|'analytics'|'approvals'|'costs'|'automation'|'connectors';
export const journeySteps:{id:string;section:JourneySection;label:string;boundary:string}[]=[
 {id:'website',section:'websites',label:'Select and prepare website',boundary:'Draft registration and ownership status'},
 {id:'intelligence',section:'intelligence',label:'Review growth intelligence',boundary:'Manual evidence and local growth/content preparation'},
 {id:'competitors',section:'competitors',label:'Compare competitors and plan product work',boundary:'Unverified claims and local backlog'},
 {id:'recommendations',section:'recommendations',label:'Review recommendations',boundary:'Durable decisions need current evidence authority'},
 {id:'content',section:'intelligence',label:'Prepare content and campaigns',boundary:'Local plan and draft preparation after intelligence preview'},
 {id:'analytics',section:'analytics',label:'Inspect performance',boundary:'Imported figures remain unverified'},
 {id:'costs',section:'costs',label:'Inspect cost controls',boundary:'Unknown spend is unavailable'},
 {id:'approvals',section:'approvals',label:'Review approvals',boundary:'Approval never publishes content'}];
