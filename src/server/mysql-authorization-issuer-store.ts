import type { Pool,PoolConnection,RowDataPacket,ResultSetHeader } from 'mysql2/promise';
import type { AuthorizationIssuerStore,AuthorizationIssuerTransaction,IssuanceSnapshot } from './authorization-issuance';
import { publicationAuthorizationSchema, type PublicationAuthorization } from '../core/publication-authorization';
import { decodeStoredContent } from './mysql-content-store';
import { MySQLPublicationAuthorization, type PublicationAuthorizationReceipt } from './mysql-publication-authorization';
import { exactUnsigned } from './mysql-integer';
type Row=RowDataPacket&Record<string,unknown>;
const iso=(v:unknown)=>v instanceof Date?v.toISOString():String(v);
const parse=(v:unknown)=>typeof v==='string'?JSON.parse(v):v;
/** Separate issuance principal. No pool/default credentials or grant escalation. Must be
 * constructed inside the independent trust lease with a current execution/connector boundary. */
export class MySQLAuthorizationIssuerStore implements AuthorizationIssuerStore {
  readonly capability='authorization-issuer' as const;
  constructor(private readonly pool:Pick<Pool,'getConnection'>,private readonly boundary:MySQLPublicationAuthorization,private readonly clock:()=>number=Date.now){}
  async transaction<T>(scope:{organizationId:string;websiteId:string},work:(tx:AuthorizationIssuerTransaction)=>Promise<T>):Promise<T>{
    const c=await this.pool.getConnection();let current:IssuanceSnapshot|undefined,sessionHash='',receipt:PublicationAuthorizationReceipt|undefined;
    try{
      await c.beginTransaction();
      const [budgets]=await c.execute<Row[]>('SELECT globally_paused FROM growth_organization_budgets WHERE organization_id=? FOR UPDATE',[scope.organizationId]);
      const [sites]=await c.execute<Row[]>('SELECT status,verified_at,automation_enabled,auto_publish_enabled FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId]);
      if(budgets.length!==1 || sites.length!==1)throw Error('ISSUANCE_SCOPE_UNAVAILABLE');
      const tx:AuthorizationIssuerTransaction={
        authenticate:async(hash,org,now)=>{
          if(org!==scope.organizationId)throw Error('SESSION_REQUIRED');sessionHash=hash;
          const [rows]=await c.execute<Row[]>('SELECT s.user_id,s.expires_at,s.revoked_at,u.disabled,m.role FROM growth_sessions s JOIN growth_users u ON u.id=s.user_id JOIN growth_memberships m ON m.user_id=s.user_id WHERE s.token_hash=? AND m.organization_id=? FOR UPDATE',[hash,org]);
          if(rows.length!==1 || rows[0].revoked_at!==null || Number(rows[0].disabled)!==0 || Date.parse(iso(rows[0].expires_at))<=now)throw Error('SESSION_REQUIRED');
          return {member:{organizationId:org,userId:String(rows[0].user_id),role:String(rows[0].role),disabled:Number(rows[0].disabled)!==0},expiresAt:Date.parse(iso(rows[0].expires_at))};
        },
        requestSeen:async key=>{const [rows]=await c.execute<Row[]>('SELECT request_key FROM growth_publication_authorization_events WHERE organization_id=? AND request_key=? FOR UPDATE',[scope.organizationId,key]);return rows.length!==0;},
        load:async command=>{
          const [records]=await c.execute<Row[]>('SELECT version,record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,command.contentId]);
          if(records.length!==1)throw Error('CONTENT_NOT_FOUND');
          const record=decodeStoredContent(records[0] as Row&{version:number;record_json:string},scope.organizationId,scope.websiteId,command.contentId);
          const [events]=await c.execute<Row[]>("SELECT event_id,actor_id,occurred_at,version,record_json FROM growth_content_events WHERE organization_id=? AND website_id=? AND content_id=? AND event_id=? AND event_kind='approve' FOR UPDATE",[scope.organizationId,scope.websiteId,record.id,command.approvalEventId]);
          if(events.length!==1)throw Error('CONTENT_APPROVAL_EVENT_REQUIRED');
          const approvedRecord=decodeStoredContent(events[0] as Row&{version:number;record_json:string},scope.organizationId,scope.websiteId,record.id);
          const [members]=await c.execute<Row[]>('SELECT m.role,u.disabled FROM growth_memberships m JOIN growth_users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=? FOR UPDATE',[scope.organizationId,events[0].actor_id]);
          if(members.length!==1)throw Error('ISSUANCE_MEMBERSHIP_DENIED');
          const [policies]=await c.execute<Row[]>('SELECT enabled,auto_publish FROM growth_content_policies WHERE organization_id=? AND website_id=? AND content_type=? FOR UPDATE',[scope.organizationId,scope.websiteId,record.contentType]);
          const [revisions]=await c.execute<Row[]>('SELECT revision,feature_enabled FROM growth_publication_policy_revisions WHERE organization_id=? AND website_id=? AND content_type=? FOR UPDATE',[scope.organizationId,scope.websiteId,record.contentType]);
          const [destinations]=await c.execute<Row[]>('SELECT channel,revision,target,enabled FROM growth_publication_destinations WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,command.destinationId]);
          const [reserves]=await c.execute<Row[]>('SELECT id,content_type,status,actual_cost_minor FROM growth_ai_reservations WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,command.reservationId]);
          if(policies.length!==1 || revisions.length!==1 || destinations.length!==1 || reserves.length!==1)throw Error('ISSUANCE_CONTEXT_UNAVAILABLE');
          const d=destinations[0],p=policies[0],v=revisions[0],r=reserves[0],site=sites[0];
          current={record,approvedRecord,approvalEventId:String(events[0].event_id),approvalActorId:String(events[0].actor_id),approvalAt:iso(events[0].occurred_at),
            approver:{organizationId:scope.organizationId,userId:String(events[0].actor_id),role:String(members[0].role),disabled:Number(members[0].disabled)!==0},
            destination:{...scope,id:command.destinationId,channel:String(d.channel),revision:String(d.revision),target:String(d.target),enabled:Number(d.enabled)===1},
            policy:{revision:String(v.revision),globalPaused:Number(budgets[0].globally_paused)!==0,siteActive:site.status==='active',websiteVerified:Boolean(site.verified_at),automationEnabled:Number(site.automation_enabled)===1,publishingEnabled:Number(site.auto_publish_enabled)===1,featureEnabled:Number(v.feature_enabled)===1,contentPublishingEnabled:Number(p.enabled)===1 && Number(p.auto_publish)===1},
            reservation:{...scope,id:String(r.id),contentType:String(r.content_type),status:String(r.status),actualCostMinor:r.actual_cost_minor===null?null:exactUnsigned(r.actual_cost_minor).toString()}};
          return current;
        },
        find:async id=>{const [rows]=await c.execute<Row[]>('SELECT authorization_json,revoked_at,consumed_at FROM growth_content_authorizations WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,id]);return rows.length===1?{authorization:publicationAuthorizationSchema.parse(parse(rows[0].authorization_json)),revoked:rows[0].revoked_at!==null,consumed:rows[0].consumed_at!==null}:null;},
        insert:async a=>{const [r]=await c.execute<ResultSetHeader>('INSERT INTO growth_content_authorizations (organization_id,website_id,id,content_id,content_version,channel,approval_event_id,reservation_id,destination_id,approver_id,authorization_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[a.organizationId,a.websiteId,a.id,a.contentId,a.contentVersion,a.channel,a.approvalDecisionId,a.reservationId,a.destinationId,a.approverId,JSON.stringify(a)]);if(r.affectedRows!==1)throw Error('ISSUANCE_INSERT_FAILED');},
        revoke:async(id,now)=>{const [r]=await c.execute<ResultSetHeader>('UPDATE growth_content_authorizations SET revoked_at=? WHERE organization_id=? AND website_id=? AND id=? AND revoked_at IS NULL AND consumed_at IS NULL',[new Date(now),scope.organizationId,scope.websiteId,id]);if(r.affectedRows!==1)throw Error('AUTHORIZATION_ALREADY_TERMINAL');},
        audit:async e=>{const [r]=await c.execute<ResultSetHeader>('INSERT INTO growth_publication_authorization_events (organization_id,website_id,authorization_id,request_key,actor_id,operation,occurred_at,authorization_json) VALUES (?,?,?,?,?,?,?,?)',[scope.organizationId,scope.websiteId,e.authorization.id,e.key,e.actorId,e.operation,new Date(e.at),JSON.stringify(e.authorization)]);if(r.affectedRows!==1)throw Error('ISSUANCE_AUDIT_FAILED');},
        checkExecution:async(a,now)=>{
          if(!current || !sessionHash)throw Error('ISSUANCE_CONTEXT_UNAVAILABLE');
          const claim={organizationId:a.organizationId,websiteId:a.websiteId,contentId:a.contentId,channel:a.channel,reservationId:a.reservationId,idempotencyKey:`publish:${a.organizationId}:${a.websiteId}:${a.contentId}:${a.channel}`,authorization:{authorizationId:a.id,sessionTokenHash:sessionHash,contentVersion:a.contentVersion,destinationId:a.destinationId}};
          const {revision:_revision,featureEnabled:_feature,...switches}=current.policy;
          receipt=await this.boundary.inspectForIssuance(c,claim,current.record,switches,now,a);
        }
      };
      const result=await work(tx);
      if(receipt){const finished=this.clock();if(!Number.isFinite(finished)||finished<receipt.checkedAt||finished>=receipt.expiresAt)throw Error('ISSUANCE_SESSION_EXPIRED');await receipt.recheck(finished);}
      await c.commit();return result;
    }catch(error){await c.rollback();throw error;}finally{c.release();}
  }
}
