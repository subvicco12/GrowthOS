/** Candidate-010 content JSON adapter. It never supplies evidence, policy or invalidation authority. */
import type {Pool,PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import type {FactoryStore,FactoryTransaction,FactoryScope,FactoryContext,FactoryPrincipal,FactoryEnvelope,ResearchSource,FactoryQualityReport} from '../core/content-factory';
import {contentBriefSchema,qualityReportSchema,researchSourceSchema,factoryReviewHash} from '../core/content-factory';
import type {ContentRecord} from '../core/content-lifecycle';
import {decodeStoredContent} from './mysql-content-store';
import {writeContentTransition} from './mysql-content-store';
import {transitionContent,type ContentEvent,type ContentActor} from '../core/content-lifecycle';
import {factoryHash} from '../core/content-factory';

type Row=RowDataPacket&Record<string,unknown>;
type Metadata=Pick<FactoryEnvelope,'schemaVersion'|'brief'|'research'|'quality'|'humanApproval'|'journal'>;
type Stored=ContentRecord&{_factory?:Metadata};
const safe=(s:string)=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const iso=(v:unknown)=>v instanceof Date?v.toISOString():String(v);
const fail=(code:string):never=>{throw Error(code);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** These are separately authenticated services; no default verifier or invalidator exists. */
export interface FactoryDurableAuthorities {
  policy(connection:PoolConnection,scope:FactoryScope,at:string):Promise<{revision:string;enabled:boolean;regulated:boolean;requiredDisclosures:string[]}>;
  evidence(connection:PoolConnection,kind:'source'|'quality',value:ResearchSource|FactoryQualityReport,binding:{scope:FactoryScope;reviewedHash:string;at:string;regulated:boolean}):Promise<void>;
  invalidate(connection:PoolConnection,scope:FactoryScope,version:number,reason:string,at:string):Promise<void>;
  currentApprover(connection:PoolConnection,approval:NonNullable<FactoryEnvelope['humanApproval']>,scope:FactoryScope,at:string):Promise<void>;
  /** Runs after the canonical scheduled record CAS on this connection; must persist its job or refuse. */
  schedule?(connection:PoolConnection,scope:FactoryScope,record:ContentRecord,at:string):Promise<void>;
}

export function decodeFactoryEnvelope(row:Row,scope:FactoryScope):FactoryEnvelope {
  const record=decodeStoredContent(row as Row&{record_json:string;version:number},scope.organizationId,scope.websiteId,scope.contentId) as Stored;
  const {_factory:metadata,...base}=record;
  if(!metadata){
    if(base.version!==0||base.stage!=='proposed'||base.eventIds.length!==0)fail('FACTORY_LEGACY_CONTENT_UNSUPPORTED');
    return {schemaVersion:1,record:base,brief:null,research:[],quality:null,humanApproval:null,journal:[]};
  }
  if(metadata.schemaVersion!==1||Object.keys(metadata).sort().join(',')!=='brief,humanApproval,journal,quality,research,schemaVersion'||!Array.isArray(metadata.research)||!Array.isArray(metadata.journal)||metadata.journal.length!==base.eventIds.length||metadata.journal.length!==base.version||new Set(base.eventIds).size!==base.eventIds.length||
    (metadata.brief!==null&&!contentBriefSchema.safeParse(metadata.brief).success)||
    (metadata.quality!==null&&!qualityReportSchema.safeParse(metadata.quality).success)||
    metadata.research.some(r=>!researchSourceSchema.safeParse(r).success)||
    metadata.journal.some((j,i)=>!j||j.eventId!==base.eventIds[i]||j.version!==i+1||!safe(j.actorId)||!safe(j.operation)||!safe(j.eventId)||!/^[a-f0-9]{64}$/.test(j.commandHash)||!Number.isFinite(Date.parse(j.at)))||
    (metadata.humanApproval!==null&&(!metadata.humanApproval||!safe(metadata.humanApproval.actorId)||!safe(metadata.humanApproval.qualityId)||!/^[a-f0-9]{64}$/.test(metadata.humanApproval.reviewedHash)||!Number.isFinite(Date.parse(metadata.humanApproval.at)))))fail('FACTORY_STORAGE_CORRUPT');
  const envelope={schemaVersion:1 as const,record:base,brief:metadata.brief,research:metadata.research,quality:metadata.quality,humanApproval:metadata.humanApproval,journal:metadata.journal};
  const digest=base.factoryReviewDigest;
  if(metadata.research.length>0&&(!same(base.sources,metadata.research.map(s=>({url:s.url,claim:s.claim,observedAt:s.observedAt})))||!metadata.brief&&base.stage==='drafted')||
     (metadata.quality!==null)!==Boolean(base.quality))fail('FACTORY_STORAGE_CORRUPT');
  if(digest!==undefined){
    if(!['approved','scheduled','cancelled','publication_unknown','published','attributed'].includes(base.stage))fail('FACTORY_APPROVAL_CORRUPT');
    if(!metadata.humanApproval||digest!==factoryReviewHash(envelope)||metadata.humanApproval.reviewedHash!==digest||base.approval?.actorId!==metadata.humanApproval.actorId)fail('FACTORY_APPROVAL_CORRUPT');
  }else if(metadata.humanApproval!==null||['approved','scheduled','publication_unknown','published','attributed'].includes(base.stage))fail('FACTORY_APPROVAL_CORRUPT');
  return envelope;
}
const encode=(value:FactoryEnvelope):string=>JSON.stringify({...value.record,_factory:{schemaVersion:1,brief:value.brief,research:value.research,quality:value.quality,humanApproval:value.humanApproval,journal:value.journal}});

/** The caller owns the locked content row and transaction; preserves approved factory metadata and journal. */
export async function writeFactoryPublicationTransition(c:PoolConnection,current:FactoryEnvelope,event:Extract<ContentEvent,{kind:'publication_unknown'|'confirm_publication'|'cancel'}>,actor:ContentActor):Promise<ContentRecord>{
  const scope={organizationId:current.record.organizationId,websiteId:current.record.websiteId,contentId:current.record.id};
  if(!current.humanApproval||!current.record.factoryReviewDigest||current.humanApproval.reviewedHash!==factoryReviewHash(current)||
    !['scheduled','publication_unknown'].includes(current.record.stage)||current.journal.length!==current.record.version)fail('FACTORY_PUBLICATION_APPROVAL_DENIED');
  const record=transitionContent(current.record,event,actor);
  const next:FactoryEnvelope={...current,record,journal:[...current.journal,{eventId:event.eventId,commandHash:factoryHash([scope,event,record.version]),actorId:actor.userId,operation:event.kind,at:event.at,version:record.version}]};
  const json=encode(next);if(Buffer.byteLength(json)>1024*1024)fail('FACTORY_RECORD_TOO_LARGE');
  decodeFactoryEnvelope({version:record.version,record_json:json} as Row,scope);
  await writeContentTransition(c,{...current.record,_factory:{schemaVersion:1,brief:current.brief,research:current.research,quality:current.quality,humanApproval:current.humanApproval,journal:current.journal}} as ContentRecord,JSON.parse(json) as ContentRecord,{event,actor});
  return record;
}

/** Explicit pool and complete authorities are mandatory. No route or worker constructs this adapter. */
export class MySQLContentFactoryStore implements FactoryStore {
  readonly capability='content-factory' as const;
  constructor(private readonly pool:Pick<Pool,'getConnection'>,private readonly authorities:FactoryDurableAuthorities,private readonly clock:()=>number=Date.now){
    if(!pool||!authorities||['policy','evidence','invalidate','currentApprover'].some(k=>typeof authorities[k as keyof FactoryDurableAuthorities]!=='function'))fail('FACTORY_AUTHORITIES_REQUIRED');
  }
  async transaction<T>(scope:FactoryScope,work:(tx:FactoryTransaction)=>Promise<T>):Promise<T>{
    if(![scope.organizationId,scope.websiteId,scope.contentId].every(safe))fail('FACTORY_SCOPE_DENIED');
    const c=await this.pool.getConnection();let current:FactoryEnvelope|undefined,principal:FactoryPrincipal|undefined,sessionHash='',rechecked=false,saved=false;
    const authenticate=async(context:FactoryContext,at:string):Promise<FactoryPrincipal>=>{
      if(context.organizationId!==scope.organizationId||!/^[a-f0-9]{64}$/.test(context.sessionHash))fail('FACTORY_SESSION_DENIED');
      const [rows]=await c.execute<Row[]>('SELECT s.user_id,s.expires_at,s.revoked_at,u.disabled,m.role FROM growth_sessions s JOIN growth_users u ON u.id=s.user_id JOIN growth_memberships m ON m.user_id=s.user_id WHERE s.token_hash=? AND m.organization_id=? FOR UPDATE',[context.sessionHash,scope.organizationId]);
      const [sites]=await c.execute<Row[]>('SELECT id FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId]);
      const atMs=Date.parse(at),r=rows[0];
      if(rows.length!==1||sites.length!==1||r.revoked_at!==null||Number(r.disabled)!==0||!['owner','admin','editor'].includes(String(r.role))||!Number.isFinite(atMs)||Date.parse(iso(r.expires_at))<=atMs)fail('FACTORY_SESSION_DENIED');
      const policy=await this.authorities.policy(c,scope,at);
      if(!policy||!safe(policy.revision)||policy.enabled!==true||typeof policy.regulated!=='boolean'||!Array.isArray(policy.requiredDisclosures)||policy.requiredDisclosures.length>10||policy.requiredDisclosures.some(d=>typeof d!=='string'||!d.trim()||d.length>1000))fail('FACTORY_POLICY_UNAVAILABLE');
      return {userId:String(r.user_id),organizationId:scope.organizationId,websiteId:scope.websiteId,role:String(r.role) as FactoryPrincipal['role'],checkedAt:at,expiresAt:new Date(Math.min(atMs+300000,Date.parse(iso(r.expires_at)))).toISOString(),sessionExpiresAt:iso(r.expires_at),regulated:policy.regulated,policyRevision:policy.revision,requiredDisclosures:policy.requiredDisclosures};
    };
    try{
      await c.beginTransaction();
      const tx:FactoryTransaction={
        authenticate:async(context,s,at)=>{if(!same(scope,s)||principal)fail('FACTORY_SCOPE_DENIED');sessionHash=context.sessionHash;principal=await authenticate(context,at);return principal;},
        load:async s=>{if(!principal||!same(scope,s)||current)fail('FACTORY_SCOPE_DENIED');const [rows]=await c.execute<Row[]>('SELECT version,record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,scope.contentId]);if(rows.length!==1)return null;current=decodeFactoryEnvelope(rows[0],scope);return structuredClone(current);},
        verifyEvidence:async(kind,evidence,binding)=>{if(!current||!same(scope,binding.scope))fail('FACTORY_SCOPE_DENIED');await this.authorities.evidence(c,kind,evidence,binding);},
        invalidateUnclaimedWork:async(s,version,reason,at)=>{if(!current||!same(scope,s)||version!==current.record.version)fail('FACTORY_VERSION_CONFLICT');await this.authorities.invalidate(c,scope,version,reason,at);},
        verifyCurrentApprover:async(approval,s,at)=>{if(!current||!same(scope,s))fail('FACTORY_SCOPE_DENIED');await this.authorities.currentApprover(c,approval,scope,at);},
        recheck:async(p,s,at)=>{const original=principal;if(!original||!same(scope,s)||p.userId!==original.userId||p.policyRevision!==original.policyRevision||p.role!==original.role)fail('FACTORY_AUTHORIZATION_CHANGED');const next=await authenticate({sessionHash,organizationId:scope.organizationId},at);if(next.userId!==p.userId||next.role!==p.role||next.regulated!==p.regulated||next.policyRevision!==p.policyRevision||!same(next.requiredDisclosures,p.requiredDisclosures))fail('FACTORY_AUTHORIZATION_CHANGED');rechecked=true;},
        save:async(s,version,next)=>{
          if(!current||!principal||!rechecked||saved||!same(scope,s)||version!==current.record.version||next.record.version!==version+1||next.record.stage==='publication_unknown'||next.record.stage==='published'||next.record.stage==='attributed'||
             next.record.organizationId!==scope.organizationId||next.record.websiteId!==scope.websiteId||next.record.id!==scope.contentId||
             !same(next.record.eventIds.slice(0,-1),current.record.eventIds)||next.journal.length!==version+1||!same(next.journal.slice(0,-1),current.journal))fail('FACTORY_SAVE_DENIED');
          const event=next.journal.at(-1),actor=principal;if(!event||!actor)throw Error('FACTORY_EVENT_INVALID');if(event.eventId!==next.record.eventIds.at(-1)||event.version!==next.record.version||event.actorId!==actor.userId||!['research','brief','draft','revise','quality','approve','schedule','cancel'].includes(event.operation))fail('FACTORY_EVENT_INVALID');
          if(Object.hasOwn(next.record,'_factory'))fail('FACTORY_METADATA_COLLISION');
          const json=encode(next);if(Buffer.byteLength(json)>1024*1024)fail('FACTORY_RECORD_TOO_LARGE');
          decodeFactoryEnvelope({version:next.record.version,record_json:json} as Row,scope);
          const [inserted]=await c.execute<ResultSetHeader>('INSERT INTO growth_content_events (organization_id,website_id,content_id,event_id,version,actor_id,event_kind,occurred_at,record_json) VALUES (?,?,?,?,?,?,?,?,?)',[scope.organizationId,scope.websiteId,scope.contentId,event.eventId,next.record.version,event.actorId,event.operation,new Date(event.at),json]);
          if(inserted.affectedRows!==1)fail('FACTORY_EVENT_REPLAY');
          const [updated]=await c.execute<ResultSetHeader>('UPDATE growth_content_records SET version=?,stage=?,record_json=? WHERE organization_id=? AND website_id=? AND id=? AND version=?',[next.record.version,next.record.stage,json,scope.organizationId,scope.websiteId,scope.contentId,version]);
          if(updated.affectedRows!==1)fail('FACTORY_VERSION_CONFLICT');
          if(event.operation==='schedule'){
            const schedule=this.authorities.schedule;
            if(typeof schedule!=='function')fail('FACTORY_DURABLE_JOB_SCHEDULER_REQUIRED');
            await schedule!(c,scope,next.record,event.at);
          }
          saved=true;
        }
      };
      const result=await work(tx);if(!saved||!rechecked)fail('FACTORY_TRANSACTION_INCOMPLETE');
      // The last read precedes commit, and belongs to this transaction. A different session/policy aborts.
      await tx.recheck(principal!,scope,new Date(this.clock()).toISOString());
      await c.commit();return result;
    }catch(error){await c.rollback();throw error;}finally{c.release();}
  }
}
