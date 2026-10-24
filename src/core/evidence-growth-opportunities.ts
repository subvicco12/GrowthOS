import { createHash } from 'node:crypto';

export type ObservedPage = { url:string; observedAt:string; sourceHash:string; status:number;
  indexable?:boolean; canonical?:string|null; title?:string|null; description?:string|null; h1Count?:number;
  wordCount?:number; internalLinks?:number; brokenLinks?:number; inSitemap?:boolean;
  duplicateOf?:string|null; structuredData?:boolean; mobileUsability?:'pass'|'fail'|'unknown';
  performanceMs?:number|null };
export type GrowthIdea = { id:string; organizationId:string; websiteId:string; category:'seo'|'content'|'conversion'|'usability';
  problem:string; proposal:string; expectedBenefit:string; evidence:{url:string;observedAt:string;hash:string};
  confidence:'observed-limited'; effort:'review-required'; cost:'unknown'; risk:'review-required';
  freshness:'current'|'expired'; status:'proposed'; priority:number };

/** Only known fields create findings. Scores and claimed revenue uplift are intentionally absent. */
export function evaluateObservedPages(scope:{organizationId:string;websiteId:string;host:string}, pages:ObservedPage[], now:string):GrowthIdea[] {
  const at=Date.parse(now);
  if (!Number.isFinite(at) || pages.length>20 || !scope.organizationId || !scope.websiteId) throw Error('INTELLIGENCE_INPUT_DENIED');
  const out:GrowthIdea[]=[];
  for(const p of pages){
    const seen=Date.parse(p.observedAt);
    if(!Number.isFinite(seen)||seen>at+300000||!/^[0-9a-f]{64}$/i.test(p.sourceHash)||
      !Number.isInteger(p.status)||p.status<100||p.status>599)throw Error('INTELLIGENCE_EVIDENCE_DENIED');
    const url=new URL(p.url);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname.toLowerCase()!==scope.host.toLowerCase()||
      [p.h1Count,p.wordCount,p.internalLinks,p.brokenLinks,p.performanceMs].some(n=>n!==undefined&&n!==null&&(!Number.isSafeInteger(n)||n<0)))
      throw Error('INTELLIGENCE_EVIDENCE_DENIED');
    const freshness=at-seen<=7*86400000?'current':'expired';
    const add=(key:string,category:GrowthIdea['category'],problem:string,proposal:string,priority:number)=>{
      const id=createHash('sha256').update([scope.organizationId,scope.websiteId,p.url,p.sourceHash,key].join('\0')).digest('hex');
      out.push({id,organizationId:scope.organizationId,websiteId:scope.websiteId,category,problem,proposal,
        expectedBenefit:'Potential improvement; outcome must be measured after implementation.',
        evidence:{url:p.url,observedAt:p.observedAt,hash:p.sourceHash},confidence:'observed-limited',
        effort:'review-required',cost:'unknown',risk:'review-required',freshness,status:'proposed',priority});
    };
    if(p.status>=400)add('http','seo',`Observed HTTP ${p.status}`,'Investigate and repair the page response.',5);
    if(p.indexable===true&&p.canonical===null)add('canonical','seo','Canonical tag observed absent','Review canonical URL and indexing policy.',3);
    if(p.indexable===true&&p.title===null)add('title','seo','Page title observed absent','Write a descriptive page title.',4);
    if(p.indexable===true&&p.description===null)add('description','seo','Meta description observed absent','Review the search snippet description.',2);
    if(p.indexable===true&&p.h1Count!==undefined&&p.h1Count!==1)add('h1','seo',`Observed ${p.h1Count} H1 headings`,'Review heading structure.',3);
    if(p.indexable===true&&p.wordCount!==undefined&&p.wordCount<300)add('depth','content',`Observed ${p.wordCount} words`,'Review content usefulness and depth.',2);
    if(p.internalLinks!==undefined&&p.internalLinks<2)add('links','conversion','Few internal paths observed','Review relevant navigation and internal links.',2);
    if(p.brokenLinks!==undefined&&p.brokenLinks>0)add('broken','seo',`${p.brokenLinks} broken links observed`,'Repair or remove broken links.',4);
    if(p.indexable===true&&p.inSitemap===false)add('sitemap','seo','Indexable page observed missing from sitemap','Review sitemap coverage.',2);
    if(p.duplicateOf)add('duplicate','seo','Duplicate page indicator observed','Review canonical and unique content.',3);
    if(p.structuredData===false)add('schema','seo','Structured data observed absent','Assess whether relevant structured data is appropriate.',1);
    if(p.mobileUsability==='fail')add('mobile','usability','Mobile usability check failed','Review touch controls and small-screen layout.',4);
    if(p.performanceMs!==undefined&&p.performanceMs!==null&&p.performanceMs>3000)add('performance','usability',`Observed ${p.performanceMs} ms measurement`,'Profile and improve measured latency.',3);
  }
  return out.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
}
