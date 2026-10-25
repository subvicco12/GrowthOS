import { z } from 'zod';

const id=z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const text=z.string().trim().min(2).max(240).refine(v=>!/[<>\u0000-\u001f]/.test(v));
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
const url=z.string().url().max(2048).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port;});
const tier=z.enum(['free','pro','business','enterprise']);
const availability=z.enum(['unknown','planned','partial','disabled','reported','verified-live']);
const category=z.enum(['onboarding','reporting','analytics','export','collaboration','integration','search','accessibility','performance','support','monetization','content','other']);
const feature=z.object({id,category,name:text,description:text,availability,tiers:z.array(tier).max(4),dependencies:z.array(id).max(20),effort:z.enum(['unknown','low','medium','high']),benefit:text}).strict();
const competitor=z.object({id,name:text,website:url,category:text,positioning:text,segments:z.array(text).max(12)}).strict();
const claim=z.object({id,competitorId:id,featureId:id,availability:z.enum(['reported','limited','unknown']),tiers:z.array(tier).max(4),
  source:url,observedOn:day,claim:text,pricing:z.object({currency:z.string().regex(/^[A-Z]{3}$/),minor:z.number().int().nonnegative().safe(),period:z.enum(['month','year'])}).strict().nullable(),
  evidenceStatus:z.literal('unverified-manual'),revoked:z.boolean()}).strict();
const schema=z.object({format:z.literal('growthos-competitor-preview'),version:z.literal(1),organizationId:id,websiteId:id,
  competitors:z.array(competitor).max(30),ownFeatures:z.array(feature).max(150),claims:z.array(claim).max(400),
  authority:z.literal('local-preview-only')}).strict();
export type CompetitorPackage=z.infer<typeof schema>;
export type ProductOpportunity={id:string;websiteId:string;featureId:string;category:string;title:string;competitorIds:string[];
  claimIds:string[];priority:number;score:{gap:number;freshness:number;reuse:number;effort:number;total:number};
  confidence:'low'|'unknown';cost:'unknown';impact:'unknown';approval:'not-requested';dependencies:string[];warning:string[]};
const unique=(items:string[])=>new Set(items).size===items.length;
export function validateCompetitorPackage(raw:unknown,scope:{organizationId:string;websiteId:string},today:string):CompetitorPackage{
  const p=schema.parse(raw);day.parse(today);
  if(p.organizationId!==scope.organizationId||p.websiteId!==scope.websiteId)throw Error('COMPETITOR_SCOPE_DENIED');
  if(!unique(p.competitors.map(c=>c.id))||!unique(p.ownFeatures.map(f=>f.id))||!unique(p.claims.map(c=>c.id)))throw Error('COMPETITOR_DUPLICATE_ID');
  const competitors=new Set(p.competitors.map(c=>c.id)),features=new Set(p.ownFeatures.map(f=>f.id));
  for(const f of p.ownFeatures)if(!unique(f.tiers)||!unique(f.dependencies)||f.dependencies.includes(f.id)||f.dependencies.some(d=>!features.has(d)))throw Error('COMPETITOR_FEATURE_REFERENCE_DENIED');
  for(const c of p.claims)if(!competitors.has(c.competitorId)||!features.has(c.featureId)||!unique(c.tiers)||c.observedOn>today||
    (c.availability==='unknown'&&c.tiers.length)||(c.availability==='unknown'&&c.pricing))throw Error('COMPETITOR_CLAIM_DENIED');
  return p;
}
export function importCompetitorPackage(bytes:Uint8Array,scope:{organizationId:string;websiteId:string},today:string){
  if(!bytes.length||bytes.length>400_000)throw Error('COMPETITOR_PACKAGE_SIZE_DENIED');
  return validateCompetitorPackage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown,scope,today);
}
export function exportCompetitorPackage(input:unknown,scope:{organizationId:string;websiteId:string},today:string){
  const output=JSON.stringify(validateCompetitorPackage(input,scope,today));
  if(new TextEncoder().encode(output).length>400_000)throw Error('COMPETITOR_PACKAGE_SIZE_DENIED');return output;
}
export function compareCompetitorFeatures(input:CompetitorPackage,scope:{organizationId:string;websiteId:string},today:string):ProductOpportunity[]{
  const p=validateCompetitorPackage(input,scope,today),result:ProductOpportunity[]=[];
  for(const f of p.ownFeatures){const relevant=p.claims.filter(c=>c.featureId===f.id&&!c.revoked&&c.availability!=='unknown');
    if(!relevant.length||f.availability==='verified-live')continue;
    const warning:string[]=[];const states=new Set(relevant.map(c=>c.availability));
    if(states.size>1)warning.push('Conflicting competitor claims; verify before planning');
    const fresh=relevant.filter(c=>Date.parse(today+'T00:00:00Z')-Date.parse(c.observedOn+'T00:00:00Z')<=90*86400000);
    if(fresh.length!==relevant.length)warning.push('Some competitor evidence is older than 90 days');
    if(f.availability==='unknown'||f.availability==='planned')warning.push('Own live feature state is unverified');
    const gap=f.availability==='disabled'||f.availability==='partial'?2:1;
    const reuse=Math.min(2,new Set(relevant.map(c=>c.competitorId)).size);
    const effort=f.effort==='low'?2:f.effort==='medium'?1:0;
    const freshness=fresh.length===relevant.length?1:0;
    const score={gap,freshness,reuse,effort,total:gap+freshness+reuse+effort};
    result.push({id:`${p.websiteId}:${f.id}`,websiteId:p.websiteId,featureId:f.id,category:f.category,title:f.name,
      competitorIds:[...new Set(relevant.map(c=>c.competitorId))],claimIds:relevant.map(c=>c.id),priority:warning.length?Math.min(3,score.total):score.total,
      score,confidence:'low',cost:'unknown',impact:'unknown',approval:'not-requested',dependencies:f.dependencies,warning});
  }
  return result.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
}
export function productImprovementPreview(p:CompetitorPackage,ids:string[],scope:{organizationId:string;websiteId:string},today:string){
  const opportunities=compareCompetitorFeatures(p,scope,today);if(ids.length>20||!unique(ids)||ids.some(id=>!opportunities.some(o=>o.id===id)))throw Error('COMPETITOR_PLAN_SELECTION_DENIED');
  return {scope,opportunities:opportunities.filter(o=>ids.includes(o.id)),state:'unsaved-local-preview' as const,
    approval:'not-requested' as const,cost:'unknown' as const,impact:'unknown' as const,
    checklist:['Verify competitor claims and own live inventory','Check current feature switches, budget and entitlement authority','Estimate effort and request human approval']};
}
export function exportOpportunityCsv(p:CompetitorPackage,scope:{organizationId:string;websiteId:string},today:string){
  const safe=(v:string)=>'"'+(/^[\s\uFEFF]*[=+\-@\t\r\n]/u.test(v)?"'":'')+v.replaceAll('"','""')+'"';
  const rows=compareCompetitorFeatures(p,scope,today);return [['websiteId','feature','category','priority','confidence','cost','impact','claimIds'],
    ...rows.map(o=>[o.websiteId,o.title,o.category,String(o.priority),o.confidence,o.cost,o.impact,o.claimIds.join(';')])]
    .map(row=>row.map(safe).join(',')).join('\r\n')+'\r\n';
}
/** Advisory only: shared feature names are candidates for reuse, never proof of suitability. */
export function portfolioReuseCandidates(packages:CompetitorPackage[],organizationId:string,today:string){
  if(packages.length>250||!organizationId||!new Set(packages.map(p=>p.websiteId)).size)throw Error('COMPETITOR_PORTFOLIO_DENIED');
  const sites=new Set<string>(),byFeature=new Map<string,{name:string;websiteIds:string[];claimIds:string[]}>();
  for(const p of packages){if(sites.has(p.websiteId))throw Error('COMPETITOR_PORTFOLIO_DUPLICATE_SITE');sites.add(p.websiteId);
    const validated=validateCompetitorPackage(p,{organizationId,websiteId:p.websiteId},today);
    for(const o of compareCompetitorFeatures(validated,{organizationId,websiteId:p.websiteId},today)){
      const key=o.title.toLocaleLowerCase();const item=byFeature.get(key)??{name:o.title,websiteIds:[],claimIds:[]};
      item.websiteIds.push(p.websiteId);item.claimIds.push(...o.claimIds);byFeature.set(key,item);
    }
  }
  return [...byFeature.values()].filter(x=>x.websiteIds.length>1).sort((a,b)=>b.websiteIds.length-a.websiteIds.length||a.name.localeCompare(b.name))
    .map(x=>({...x,authority:'review-only' as const,cost:'unknown' as const,warning:'Verify relevance and scope independently for each website'}));
}
