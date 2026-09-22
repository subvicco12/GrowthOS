import type { WebsiteSnapshot, QaFinding } from './discovery';
export interface EvidenceSql { query<T=unknown>(sql:string,params?:unknown[]):Promise<{rows:T[]}>; }
export class PostgresEvidenceStore {
 constructor(private readonly db:EvidenceSql){}
 async save(snapshot:WebsiteSnapshot,findings:QaFinding[]):Promise<string>{
  const {rows}=await this.db.query<{id:string}>(`insert into public.website_snapshots(site_id,url,routes,features,technologies,captured_at) values($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6) returning id`,[snapshot.siteId,snapshot.url,JSON.stringify(snapshot.routes),JSON.stringify(snapshot.features),JSON.stringify(snapshot.technologies),snapshot.capturedAt]);
  const id=rows[0]?.id;if(!id)throw new Error('SNAPSHOT_PERSIST_FAILED');
  for(const f of findings) await this.db.query(`insert into public.qa_findings(snapshot_id,site_id,finding_key,category,severity,title,evidence) values($1,$2,$3,$4,$5,$6,$7) on conflict(snapshot_id,finding_key) do nothing`,[id,snapshot.siteId,f.id,f.category,f.severity,f.title,f.evidence]);
  return id;
 }
 async latest(siteId:string):Promise<WebsiteSnapshot|null>{
  const {rows}=await this.db.query<any>(`select site_id,url,routes,features,technologies,captured_at from public.website_snapshots where site_id=$1 order by captured_at desc limit 1`,[siteId]); const r=rows[0]; return r?{siteId:r.site_id,url:r.url,routes:r.routes,features:r.features,technologies:r.technologies,capturedAt:new Date(r.captured_at).toISOString()}:null;
 }
}
