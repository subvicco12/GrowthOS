export function normalizePageUrl(value:string):string{
 const raw=value.trim();
 if(!raw)return raw;
 try{
  const url=new URL(raw,'https://growthos.invalid');
  url.hash='';
  url.hostname=url.hostname.toLowerCase();
  if((url.protocol==='https:'&&url.port==='443')||(url.protocol==='http:'&&url.port==='80'))url.port='';
  const isSynthetic=url.hostname==='growthos.invalid';
  let pathname=url.pathname.replace(/\/{2,}/g,'/');
  if(pathname!=='/'&&pathname.endsWith('/'))pathname=pathname.slice(0,-1);
  url.pathname=pathname||'/';
  if(isSynthetic)return url.pathname+url.search;
  return url.toString();
 }catch{return raw;}
}
export function dedupePageUrls(values:string[]):string[]{
 const seen=new Set<string>(),out:string[]=[];
 for(const value of values){const normalized=normalizePageUrl(value);if(normalized&&!seen.has(normalized)){seen.add(normalized);out.push(normalized);}}
 return out;
}
