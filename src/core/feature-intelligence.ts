export type FeatureEvidenceSource='url'|'title'|'metadata'|'manual'|'connector';
export type DiscoveryConfidence='high'|'medium'|'low';

export interface SitePageEvidence {
  url:string;
  title?:string;
  metaDescription?:string;
  httpStatus?:number;
  evidence?:Record<string,unknown>;
}

export interface DiscoveredFeatureCandidate {
  featureKey:string;
  name:string;
  category:'core_tool'|'conversion'|'analytics'|'integration'|'account'|'content'|'commerce'|'other';
  evidence: string[];
  source:FeatureEvidenceSource;
  confidence:DiscoveryConfidence;
}

const RULES:Array<{test:RegExp;name:string;category:DiscoveredFeatureCandidate['category']}>= [
 {test:/(calculator|calculators|tool|tools|generator|convert|converter|compress|merge|split|crop|ocr|scanner|scan)/i,name:'Core online tool',category:'core_tool'},
 {test:/(pricing|plans|billing|subscription|checkout)/i,name:'Paid plans / pricing',category:'commerce'},
 {test:/(analytics|statistics|metrics|dashboard|reports|report)/i,name:'Analytics / reporting',category:'analytics'},
 {test:/(api|integration|webhook|zapier|export|csv|json)/i,name:'Integrations / export',category:'integration'},
 {test:/(login|signin|sign-in|signup|register|account|profile)/i,name:'User accounts',category:'account'},
 {test:/(templates|template|guides|blog|resources|learn)/i,name:'Templates / educational content',category:'content'},
 {test:/(affiliate|referral|invite|share)/i,name:'Referral / sharing',category:'conversion'},
];

const keyFor=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);

export function discoverFeatureCandidates(pages:SitePageEvidence[]):DiscoveredFeatureCandidate[] {
 const found=new Map<string,DiscoveredFeatureCandidate>();
 for(const page of pages){
  const text=[page.url,page.title??'',page.metaDescription??''].join(' ');
  for(const rule of RULES){
   if(!rule.test.test(text)) continue;
   const key=keyFor(rule.name);
   const evidence=[page.url,...(page.title?[page.title]:[])].filter(Boolean);
   const existing=found.get(key);
   if(existing){existing.evidence=[...new Set([...existing.evidence,...evidence])].slice(0,20);continue;}
   const explicitUrl=rule.test.test(page.url);
   found.set(key,{featureKey:key,name:rule.name,category:rule.category,evidence,source:explicitUrl?'url':'title',confidence:explicitUrl?'high':'medium'});
  }
 }
 return [...found.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

export function mergeFeatureEvidence(
 current:DiscoveredFeatureCandidate[],
 incoming:DiscoveredFeatureCandidate[],
):DiscoveredFeatureCandidate[] {
 const map=new Map(current.map(x=>[x.featureKey,{...x,evidence:[...x.evidence]}]));
 for(const item of incoming){
  const existing=map.get(item.featureKey);
  if(!existing){map.set(item.featureKey,{...item,evidence:[...item.evidence]});continue;}
  existing.evidence=[...new Set([...existing.evidence,...item.evidence])].slice(0,50);
  if(existing.confidence==='low'&&item.confidence!=='low') existing.confidence=item.confidence;
 }
 return [...map.values()];
}
