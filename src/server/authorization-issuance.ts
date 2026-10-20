import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ContentRecord } from '../core/content-lifecycle';
import { assertPublicationAuthorization, contentAuthorizationHash, publicationPolicyHash, type CurrentPublicationMember, type PublicationAuthorization, type PublicationDestination, type PublicationPolicySnapshot } from '../core/publication-authorization';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const issuanceCommandSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('issue'),websiteId:id,contentId:id,contentVersion:z.number().int().nonnegative().safe(),destinationId:id,reservationId:id,
    expectedContentHash:hash,expectedPolicyHash:hash,expectedDestinationRevision:id,expectedDestinationTarget:z.string().max(2048),approvalEventId:id,
    idempotencyKey:id,explicitConsent:z.literal(true)}).strict(),
  z.object({action:z.literal('revoke'),websiteId:id,authorizationId:id,idempotencyKey:id}).strict()
]);
export type IssuanceCommand=z.infer<typeof issuanceCommandSchema>;
export interface IssuanceSnapshot {
  record:ContentRecord; policy:PublicationPolicySnapshot; destination:PublicationDestination; approver:CurrentPublicationMember;
  approvedRecord:ContentRecord; approvalEventId:string; approvalActorId:string; approvalAt:string;
  reservation:{id:string;organizationId:string;websiteId:string;contentType:string;status:string;actualCostMinor:string|null};
}
export interface AuthorizationIssuerTransaction {
  authenticate(sessionHash:string,organizationId:string,now:number):Promise<{member:CurrentPublicationMember;expiresAt:number}>;
  load(command:Extract<IssuanceCommand,{action:'issue'}>):Promise<IssuanceSnapshot>;
  find(id:string):Promise<{authorization:PublicationAuthorization;revoked:boolean;consumed:boolean}|null>;
  requestSeen(key:string):Promise<boolean>;
  insert(authorization:PublicationAuthorization):Promise<void>;
  revoke(id:string,now:number):Promise<void>;
  audit(input:{key:string;actorId:string;operation:'issue'|'revoke';authorization:PublicationAuthorization;at:number}):Promise<void>;
  /** Must check current quota/budget/connector controls under the same transaction/anchor lease.
   * Never reserve/charge or dispatch implicitly. Missing adapter refuses. */
  checkExecution(authorization:PublicationAuthorization,now:number):Promise<void>;
}
export interface AuthorizationIssuerStore {
  readonly capability:'authorization-issuer';
  transaction<T>(scope:{organizationId:string;websiteId:string},work:(tx:AuthorizationIssuerTransaction)=>Promise<T>):Promise<T>;
}
export function assertDurableApproval(snapshot:IssuanceSnapshot) {
  const {record:r,approvedRecord:a}=snapshot;
  if(a.stage!=='approved' || a.version!==r.version-1 || a.eventIds.at(-1)!==snapshot.approvalEventId || r.eventIds.at(-2)!==snapshot.approvalEventId ||
    snapshot.approvalActorId!==r.approval?.actorId || Date.parse(snapshot.approvalAt)!==Date.parse(r.approval.at) ||
    contentAuthorizationHash({...a,stage:r.stage,version:r.version,eventIds:r.eventIds,schedule:r.schedule})!==contentAuthorizationHash(r))throw Error('CONTENT_APPROVAL_EVENT_MISMATCH');
}
export class PublicationAuthorizationIssuer {
  constructor(private readonly store:AuthorizationIssuerStore,private readonly clock:()=>number=Date.now,private readonly newId:()=>string=randomUUID) {
    if(store.capability!=='authorization-issuer')throw Error('AUTHORIZATION_ISSUER_CAPABILITY_REQUIRED');
  }
  /** Session hash and org are derived by the server cookie boundary, never from command JSON. */
  async execute(serverContext:{sessionHash:string;organizationId:string},raw:unknown):Promise<{authorizationId:string;state:'issued'|'revoked'}> {
    const context={...serverContext};
    const command=issuanceCommandSchema.parse(raw),now=this.clock();
    if(!/^[a-f0-9]{64}$/.test(context.sessionHash) || !id.safeParse(context.organizationId).success || !Number.isFinite(now))throw Error('SESSION_REQUIRED');
    return this.store.transaction({organizationId:context.organizationId,websiteId:command.websiteId},async tx=>{
      const session=await tx.authenticate(context.sessionHash,context.organizationId,now);
      const actor=session.member;
      if(actor.organizationId!==context.organizationId || actor.disabled!==false || !['owner','admin'].includes(actor.role) || !actor.userId || !Number.isFinite(session.expiresAt) || session.expiresAt<=now)throw Error('ISSUANCE_MEMBERSHIP_DENIED');
      if(await tx.requestSeen(command.idempotencyKey))throw Error('AUTHORIZATION_REQUEST_REPLAY');
      let authorization:PublicationAuthorization;
      if(command.action==='issue') {
        const s=await tx.load(command),r=s.record;
        assertDurableApproval(s);
        if(r.organizationId!==context.organizationId || r.websiteId!==command.websiteId || r.id!==command.contentId || r.version!==command.contentVersion || contentAuthorizationHash(r)!==command.expectedContentHash || publicationPolicyHash(r,s.policy)!==command.expectedPolicyHash || s.destination.id!==command.destinationId || s.destination.revision!==command.expectedDestinationRevision || s.destination.target!==command.expectedDestinationTarget || s.approvalEventId!==command.approvalEventId)throw Error('ISSUANCE_REVIEW_CHANGED');
        const reserve=s.reservation;
        if(reserve.id!==command.reservationId || reserve.organizationId!==r.organizationId || reserve.websiteId!==r.websiteId || reserve.contentType!==r.contentType || reserve.status!=='completed' || reserve.actualCostMinor===null || !/^(0|[1-9][0-9]*)$/.test(reserve.actualCostMinor))throw Error('ISSUANCE_RESERVATION_DENIED');
        authorization={schemaVersion:1,id:this.newId(),organizationId:r.organizationId,websiteId:r.websiteId,contentId:r.id,contentVersion:r.version,contentHash:command.expectedContentHash,
          channel:r.schedule!.channel,destinationId:s.destination.id,destinationRevision:s.destination.revision,destinationTarget:s.destination.target,reservationId:reserve.id,
          approvalDecisionId:s.approvalEventId,decision:'approved',purpose:'content_publication',approverId:s.approvalActorId,approvedAt:s.approvalAt,
          issuedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+300000,session.expiresAt)).toISOString(),policyHash:command.expectedPolicyHash};
        assertPublicationAuthorization({record:r,channel:authorization.channel,reservationId:reserve.id,request:{authorizationId:authorization.id,sessionTokenHash:context.sessionHash,contentVersion:r.version,destinationId:s.destination.id},authorization,policy:s.policy,requestor:actor,approver:s.approver,destination:s.destination,now});
        await tx.checkExecution(authorization,now);
        await tx.insert(authorization);
      }else{
        const found=await tx.find(command.authorizationId);
        if(!found || found.authorization.organizationId!==context.organizationId || found.authorization.websiteId!==command.websiteId)throw Error('AUTHORIZATION_NOT_FOUND');
        if(found.consumed || found.revoked)throw Error('AUTHORIZATION_ALREADY_TERMINAL');
        authorization=found.authorization;await tx.revoke(authorization.id,now);
      }
      const finished=this.clock();
      if(!Number.isFinite(finished) || finished<now || finished>=session.expiresAt || (command.action==='issue' && finished>=Date.parse(authorization.expiresAt)))throw Error('ISSUANCE_SESSION_EXPIRED');
      await tx.audit({key:command.idempotencyKey,actorId:actor.userId,operation:command.action,authorization,at:finished});
      return {authorizationId:authorization.id,state:command.action==='issue'?'issued':'revoked'};
    });
  }
}
/** Reject duplicate/malformed cookies. No identity or membership comes from request JSON/headers. */
export function issuanceSessionContext(request:Request) {
  const values=new Map<string,string>();
  for(const part of (request.headers.get('cookie')||'').split(';')){
    const index=part.indexOf('=');if(index<0)continue;
    const name=part.slice(0,index).trim();if(!['growthos_session','growthos_organization'].includes(name))continue;
    if(values.has(name))throw Error('SESSION_REQUIRED');
    try{values.set(name,decodeURIComponent(part.slice(index+1).trim()));}catch{throw Error('SESSION_REQUIRED');}
  }
  const token=values.get('growthos_session'),organizationId=values.get('growthos_organization');
  if(!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || !organizationId || !id.safeParse(organizationId).success)throw Error('SESSION_REQUIRED');
  return {sessionHash:createHash('sha256').update(token).digest('hex'),organizationId};
}
