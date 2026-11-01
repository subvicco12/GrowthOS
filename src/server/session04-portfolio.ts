import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolConnection,RowDataPacket} from 'mysql2/promise';
import {z} from 'zod';
import {MySQLIsolatedOperations} from './mysql-isolated-operations';
import {assertCompatibleDevelopmentSchema} from './schema-compatibility';
import {validateReviewBundle,type ReviewBundle} from '../core/review-bundle';
import {LocalObservationProvider} from '../core/provider-evidence';
import {bumpStopFence} from './session03-authority';
type Row=RowDataPacket&Record<string,any>;
const hash=(input:string)=>createHash('sha256').update(input).digest('hex');
const read=(value:any)=>typeof value==='string'?JSON.parse(value):value;
const cursorSchema=z.object({org:z.string().uuid(),view:z.enum(['sites','incidents']),filter:z.string(),key:z.string().max(253),id:z.string().uuid()}).strict();
export class Session04Portfolio extends MySQLIsolatedOperations{
 constructor(pool:Pick<Pool,'getConnection'>){super(pool,{read:async()=>{throw Error('NO_NETWORK_ADAPTER');}});}
 private async organization(c:PoolConnection,org:string,actor:string,write=false){
  await assertCompatibleDevelopmentSchema(c);
  const [members]=await c.execute<Row[]>('SELECT m.role FROM growth_memberships m JOIN growth_users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=? AND u.disabled=FALSE FOR UPDATE',[org,actor]);
  if(!members[0]||!['owner','admin',...(!write?['editor','viewer']:[])].includes(members[0].role))throw Error('INSUFFICIENT_ROLE');return members[0].role;
 }
 private async incident(c:PoolConnection,org:string,actor:string,kind:string,detail:string,site:string|null=null){await c.execute('INSERT INTO growth_dev_incidents(id,organization_id,website_id,actor_id,kind,detail) VALUES (?,?,?,?,?,?)',[randomUUID(),org,site,actor,kind,detail]);}
 async portfolio(org:string,actor:string,view:'sites'|'incidents',search:string,status:string,raw?:string){return this.transaction(async c=>{
  await this.organization(c,org,actor);const filter=hash(JSON.stringify([search,status]));let cursor:z.infer<typeof cursorSchema>|undefined;
  if(raw!==undefined){try{if(!/^[A-Za-z0-9_-]{1,900}$/.test(raw))throw Error();const bytes=Buffer.from(raw,'base64url');if(bytes.toString('base64url')!==raw)throw Error();cursor=cursorSchema.parse(JSON.parse(bytes.toString('utf8')));if(cursor.org!==org||cursor.view!==view||cursor.filter!==filter)throw Error();}catch{throw Error('INVALID_CURSOR');}}
  const [counts]=await c.execute<Row[]>('SELECT status,COUNT(*) AS total FROM growth_dev_analysis_jobs WHERE organization_id=? GROUP BY status',[org]);
  const [policies]=await c.execute<Row[]>('SELECT emergency_stopped,ai_limit_minor,revision FROM growth_dev_fleet_policy WHERE organization_id=?',[org]);
  const [[usage]]=await c.execute<Row[]>("SELECT COUNT(*) AS reservations,COALESCE(SUM(actual_cost_minor),0) AS actual_minor FROM growth_ai_reservations WHERE organization_id=? AND month_start=DATE_FORMAT(UTC_DATE(),'%Y-%m-01')",[org]);
  let rows:Row[];
  if(view==='sites'){
   const binds:any[]=[org,search,search,status,status];let where='w.organization_id=? AND (?=\'\' OR LOCATE(?,w.domain)>0) AND (?=\'all\' OR w.status=?)';if(cursor){where+=' AND (w.domain>? OR (w.domain=? AND w.id>?))';binds.push(cursor.key,cursor.key,cursor.id);}
   [rows]=await c.execute<Row[]>(`SELECT w.id,w.domain,w.platform,w.status,w.monthly_budget_minor,g.valid_until,g.revoked_at,
    (SELECT health_state FROM growth_dev_connector_enrollments x WHERE x.organization_id=w.organization_id AND x.website_id=w.id) AS synthetic_health,
    (SELECT state FROM growth_dev_wordpress_fixtures x WHERE x.organization_id=w.organization_id AND x.website_id=w.id) AS wordpress_fixture_state,
    (SELECT health_state FROM growth_dev_wordpress_fixtures x WHERE x.organization_id=w.organization_id AND x.website_id=w.id) AS wordpress_fixture_health,
    (SELECT COUNT(*) FROM growth_dev_analysis_jobs j WHERE j.organization_id=w.organization_id AND j.website_id=w.id AND j.status='failed') AS failed_jobs,
    (SELECT COUNT(*) FROM growth_dev_analysis_jobs j WHERE j.organization_id=w.organization_id AND j.website_id=w.id AND j.status='scheduled' AND j.error_code IS NOT NULL) AS retry_jobs,
    (SELECT COUNT(*) FROM growth_website_feature_audit a WHERE a.organization_id=w.organization_id AND a.website_id=w.id) AS shutdown_events
    FROM growth_websites w LEFT JOIN growth_dev_ownership_grants g ON g.organization_id=w.organization_id AND g.website_id=w.id WHERE ${where} ORDER BY w.domain,w.id LIMIT 26`,binds);
  }else{
   [rows]=await c.execute<Row[]>("SELECT id,website_id,kind,detail,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f') AS position FROM growth_dev_incidents WHERE organization_id=?"+(cursor?' AND (created_at<? OR (created_at=? AND id<?))':'')+' ORDER BY created_at DESC,id DESC LIMIT 26',cursor?[org,cursor.key,cursor.key,cursor.id]:[org]);
  }
  const page=rows.slice(0,25),last=page.at(-1);return {items:page.map(r=>view==='sites'?{...r,ownership:!r.valid_until?'unverified':r.revoked_at?'revoked':new Date(r.valid_until).getTime()<=Date.now()?'expired':'current'}:r),
   nextCursor:rows.length>25&&last?Buffer.from(JSON.stringify({org,view,filter,key:view==='sites'?last.domain:last.position,id:last.id})).toString('base64url'):null,
   summary:{jobs:counts.map(r=>({status:r.status,total:Number(r.total)})),fleetStopped:policies[0]?Number(policies[0].emergency_stopped)!==0:true,policyRevision:Number(policies[0]?.revision||0),aiLimitMinor:String(policies[0]?.ai_limit_minor||'0'),recordedMonthlyActualMinor:String(usage.actual_minor),reservationCount:Number(usage.reservations),currency:'unavailable',externalProvidersEnabled:false}};
 });}
 async fleet(org:string,actor:string,stopped:boolean){return this.transaction(async c=>{
  await this.organization(c,org,actor,true);const [sites]=await c.execute<Row[]>('SELECT id FROM growth_websites WHERE organization_id=? ORDER BY id FOR UPDATE',[org]);
  await c.execute('INSERT INTO growth_dev_fleet_policy(organization_id,emergency_stopped) VALUES (?,?) ON DUPLICATE KEY UPDATE emergency_stopped=VALUES(emergency_stopped),revision=revision+1',[org,stopped]);
  if(stopped)for(const site of sites)await bumpStopFence(c,{organizationId:org,websiteId:site.id});
  await this.incident(c,org,actor,stopped?'fleet_emergency_stop':'local_fleet_resumed',stopped?'All previous local job authority fenced':'Local zero-spend workers only; no external execution');return {stopped,externalEnabled:false,aiLimitMinor:'0'};
 });}
 async exportBundle(org:string,site:string,actor:string):Promise<ReviewBundle>{return this.transaction(async c=>{
  await this.organization(c,org,actor,true);await this.site(c,{organizationId:org,websiteId:site,actorId:actor});
  const [jobs]=await c.execute<Row[]>('SELECT id,input_hash,input_json,created_at FROM growth_dev_analysis_jobs WHERE organization_id=? AND website_id=? ORDER BY id LIMIT 201',[org,site]);
  const [approvals]=await c.execute<Row[]>("SELECT id,title,action_type,status,created_at FROM growth_approval_queue WHERE organization_id=? AND website_id=? AND action_type IN ('manual_analysis','manual_recommendation') ORDER BY id LIMIT 501",[org,site]);
  const [decisions]=await c.execute<Row[]>("SELECT d.* FROM growth_approval_decisions d JOIN growth_approval_queue a ON a.id=d.approval_id AND a.organization_id=d.organization_id AND a.website_id=d.website_id WHERE d.organization_id=? AND d.website_id=? AND a.action_type IN ('manual_analysis','manual_recommendation') ORDER BY d.id LIMIT 201",[org,site]);
  const [revocations]=await c.execute<Row[]>("SELECT r.* FROM growth_dev_approval_revocations r JOIN growth_approval_queue a ON a.id=r.approval_id AND a.organization_id=r.organization_id AND a.website_id=r.website_id WHERE r.organization_id=? AND r.website_id=? AND a.action_type IN ('manual_analysis','manual_recommendation') ORDER BY r.approval_id LIMIT 101",[org,site]);
  if(jobs.length>200||approvals.length>500||decisions.length>200||revocations.length>100)throw Error('EXPORT_WINDOW_EXCEEDED');
  const bundle=validateReviewBundle({version:'GrowthOSReviewBundle/v1',organizationId:org,websiteId:site,source:'isolated-017-018',target:'canonical_review_quarantine',records:[
   ...jobs.map(j=>({kind:'manual_research',id:j.id,createdAt:new Date(j.created_at).toISOString(),sourceHash:j.input_hash,input:read(j.input_json).request,trust:'unverified_manual'})),
   ...approvals.map(a=>({kind:'internal_approval',id:a.id,createdAt:new Date(a.created_at).toISOString(),title:a.title,actionType:a.action_type,status:a.status,trust:'internal_only'})),
   ...decisions.map(d=>({kind:'approval_decision',id:d.id,createdAt:new Date(d.created_at).toISOString(),approvalId:d.approval_id,actorId:d.actor_id,idempotencyKey:d.idempotency_key,decision:d.decision,note:d.note,trust:'internal_only'})),
   ...revocations.map(r=>({kind:'approval_revocation',id:r.approval_id,createdAt:new Date(r.recorded_at).toISOString(),approvalId:r.approval_id,actorId:r.actor_id,reason:r.reason,trust:'internal_only'}))]},org,site);
  if(Buffer.byteLength(JSON.stringify(bundle))>900000)throw Error('EXPORT_WINDOW_EXCEEDED');return bundle;
 });}
 async stageBundle(org:string,site:string,actor:string,key:string,raw:unknown){const bundle=validateReviewBundle(raw,org,site);for(const record of bundle.records)if(record.kind==='manual_research'&&hash(JSON.stringify(record.input))!==record.sourceHash)throw Error('BUNDLE_HASH_MISMATCH');
  return this.transaction(async c=>{await this.organization(c,org,actor,true);await this.site(c,{organizationId:org,websiteId:site,actorId:actor});const digest=hash(JSON.stringify(bundle));
   const [existing]=await c.execute<Row[]>('SELECT id,bundle_hash,state FROM growth_dev_bridge_batches WHERE organization_id=? AND website_id=? AND request_key=? FOR UPDATE',[org,site,key]);
   if(existing[0]){if(existing[0].bundle_hash!==digest||existing[0].state!=='quarantined')throw Error('BUNDLE_CONFLICT');return {id:existing[0].id,duplicate:true};}
   const id=randomUUID();await c.execute("INSERT INTO growth_dev_bridge_batches(id,organization_id,website_id,actor_id,request_key,bundle_hash,state) VALUES (?,?,?,?,?,?,'quarantined')",[id,org,site,actor,key,digest]);
   for(const record of bundle.records)await c.execute('INSERT INTO growth_dev_bridge_items(id,organization_id,website_id,batch_id,record_kind,payload_json) VALUES (?,?,?,?,?,?)',[randomUUID(),org,site,id,record.kind,JSON.stringify(record)]);
   await this.incident(c,org,actor,'review_bundle_quarantined',digest,site);return {id,duplicate:false};});
 }
 async revertBundle(org:string,site:string,actor:string,id:string){return this.transaction(async c=>{
  await this.organization(c,org,actor,true);await this.site(c,{organizationId:org,websiteId:site,actorId:actor});const [rows]=await c.execute<Row[]>('SELECT id,state FROM growth_dev_bridge_batches WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[org,site,id]);if(!rows[0])throw Error('BUNDLE_NOT_FOUND');
  if(rows[0].state==='quarantined'){await c.execute('DELETE FROM growth_dev_bridge_items WHERE organization_id=? AND website_id=? AND batch_id=?',[org,site,id]);await c.execute("UPDATE growth_dev_bridge_batches SET state='reverted' WHERE organization_id=? AND website_id=? AND id=?",[org,site,id]);await this.incident(c,org,actor,'review_bundle_reverted',id,site);}return {reverted:true};
 });}
 async observe(org:string,site:string,actor:string,html:string){const observation=await new LocalObservationProvider().collect({websiteId:site,html},new AbortController().signal);
  return this.transaction(async c=>{await this.organization(c,org,actor);await this.site(c,{organizationId:org,websiteId:site,actorId:actor},['owner','admin','editor']);const id=randomUUID(),payload=JSON.stringify(observation);await c.execute('INSERT INTO growth_dev_provider_observations(id,organization_id,website_id,actor_id,source_kind,source_label,payload_hash,payload_json,observed_at) VALUES (?,?,?,?,?,?,?,?,?)',[id,org,site,actor,observation.sourceKind,observation.sourceLabel,hash(payload),payload,new Date(observation.observedAt)]);await this.incident(c,org,actor,'local_artifact_observed','Unverified local artifact metrics recorded',site);return {id,observation};});}
}
