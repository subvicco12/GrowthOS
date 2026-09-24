export interface SeoPage { url:string; status:number; indexable:boolean; canonical?:string; title?:string; description?:string; h1Count:number; wordCount:number; internalLinks:number; }
export interface SeoFinding { key:string; url:string; type:'indexability'|'canonical'|'metadata'|'heading'|'content'|'internal_link'; severity:'info'|'warning'|'critical'; evidence:string; }
export function inspectSeoPages(pages:SeoPage[]):SeoFinding[]{
 const out:SeoFinding[]=[];
 for(const p of pages){
  if(p.status>=400)out.push({key:'http-error',url:p.url,type:'indexability',severity:'critical',evidence:`HTTP status ${p.status}`});
  if(p.indexable&&!p.canonical)out.push({key:'missing-canonical',url:p.url,type:'canonical',severity:'warning',evidence:'Indexable page has no canonical evidence'});
  if(p.indexable&&!p.title)out.push({key:'missing-title',url:p.url,type:'metadata',severity:'critical',evidence:'Indexable page has no title evidence'});
  if(p.indexable&&!p.description)out.push({key:'missing-description',url:p.url,type:'metadata',severity:'warning',evidence:'Indexable page has no meta description evidence'});
  if(p.indexable&&p.h1Count!==1)out.push({key:'h1-count',url:p.url,type:'heading',severity:p.h1Count===0?'critical':'warning',evidence:`Observed H1 count: ${p.h1Count}`});
  if(p.indexable&&p.wordCount<300)out.push({key:'thin-content',url:p.url,type:'content',severity:'warning',evidence:`Observed word count: ${p.wordCount}`});
  if(p.indexable&&p.internalLinks<2)out.push({key:'weak-internal-linking',url:p.url,type:'internal_link',severity:'warning',evidence:`Observed internal links: ${p.internalLinks}`});
 }
 return out;
}
