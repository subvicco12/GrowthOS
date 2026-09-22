import type { WebsiteSnapshot, QaFinding } from './discovery';
export interface EvidenceSql { query<T=unknown>(sql:string,params?:unknown[]):Promise<{rows:T[]}>; }
export class PostgresEvidenceStore {
 constructor(private readonly db:EvidenceSql){}
 async save(snapshot:WebsiteSnapshot,findings:QaFinding[]):Promise<string>{
  const payload=findings.map(f=>({finding_key:f.id,category:f.category,severity:f.severity,title:f.title,evidence:f.evidence}));
  const {rows}=await this.db.query<{id:string}>(`with snapshot as (
    insert into public.website_snapshots(site_id,url,routes,features,technologies,captured_at) values($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6) returning id,site_id
   ), inserted_findings as (
    insert into public.qa_findings(snapshot_id,site_id,finding_key,category,severity,title,evidence)
    select s.id,s.site_id,f.finding_key,f.category,f.severity,f.title,f.evidence
    from snapshot s cross join jsonb_to_recordset($7::jsonb) as f(finding_key text,category text,severity text,title text,evidence text)
    on conflict(snapshot_id,finding_key) do nothing returning snapshot_id
   ) select id from snapshot`,[snapshot.siteId,snapshot.url,JSON.stringify(snapshot.routes),JSON.stringify(snapshot.features),JSON.stringify(snapshot.technologies),snapshot.capturedAt,JSON.stringify(payload)]);
  const id=rows[0]?.id;if(!id)throw new Error('SNAPSHOT_PERSIST_FAILED'); return id;
 }
 async latest(siteId:string):Promise<WebsiteSnapshot|null>{
  const {rows}=await this.db.query<any>(`select site_id,url,routes,features,technologies,captured_at from public.website_snapshots where site_id=$1 order by captured_at desc limit 1`,[siteId]); const r=rows[0]; return r?{siteId:r.site_id,url:r.url,routes:r.routes,features:r.features,technologies:r.technologies,capturedAt:new Date(r.captured_at).toISOString()}:null;
 }
}
