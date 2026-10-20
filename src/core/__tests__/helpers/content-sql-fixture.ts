import assert from 'node:assert/strict';
import type { Pool } from 'mysql2/promise';
import { publicationBridgeFixture } from './publication-bridge-fixture';
import type { ContentRecord } from '../../content-lifecycle';

type ClaimRow = { organization_id:string; website_id:string; content_id:string; channel:string; claim_hash:string; reservation_id:string; status:string; provider_id?:string|null; publication_url?:string|null };
/** Serialized SQL simulator, not a MariaDB server or SQL parser. Models rollback and uniqueness only. */
export function contentSQLFixture(record: ContentRecord, now: number) {
  const bridge = publicationBridgeFixture(record,now);
  let data = { issuedAuth:null as typeof bridge.authorization|null, issuanceAudit:new Map<string,unknown[]>(), consumed:false, authorizationUses:new Map<string,unknown[]>(), record:structuredClone(record), claim:null as ClaimRow|null, events:new Map<string,unknown[]>(), observations:new Map<string,{payload_hash:unknown}>() };
  let tail: Promise<void> = Promise.resolve();
  const state = { commits:0,rollbacks:0,queries:[] as {sql:string;params:unknown[]}[], failSQL:'', health:'verified', checkedAt:new Date(now-60000).toISOString(), expiresAt:new Date(now+60000).toISOString(), budgetAvailable:true, reservationStatus:'completed', actualCost:'20' as string|null, paused:0, publishing:1, automation:1, policy:1, reservationSite:record.websiteId, approvalEventMissing:false, approvalEventActor:record.approval!.actorId, sessionRevoked:false, sessionExpires:new Date(now+60000).toISOString(), requestorRole:'owner', approverRole:'owner', membership:true, userDisabled:0, approvalRevoked:false, approval:bridge.authorization, destination:bridge.destination, policyRevision:bridge.policy.revision, feature:1, attestation:bridge.signed, connectorRevoked:false, issuerRevoked:0, trustRevision:bridge.issuer.trustRevision };
  const duplicate = () => Object.assign(Error('duplicate'),{code:'ER_DUP_ENTRY'});
  const pool = { getConnection: async () => {
    let release: (()=>void)|undefined;
    let snapshot: typeof data|undefined;
    return {
      beginTransaction: async () => { const previous=tail; tail=new Promise<void>(resolve=>{release=resolve;}); await previous; snapshot=structuredClone(data); },
      commit: async () => { state.commits++; snapshot=undefined; release?.(); release=undefined; },
      rollback: async () => { state.rollbacks++; if(snapshot)data=snapshot; snapshot=undefined; release?.(); release=undefined; },
      release: () => { assert.equal(snapshot,undefined,'transaction must finish before release'); },
      execute: async (sql:string,params:unknown[] = []) => {
        state.queries.push({sql,params});
        if(state.failSQL && sql.includes(state.failSQL)) throw Error('SYNTHETIC_SQL_FAILURE');
        let result: unknown = [];
        if(sql.includes('FROM growth_organization_budgets')) result=params[0]===record.organizationId && state.budgetAvailable ? [{globally_paused:state.paused}] : [];
        else if(sql.includes('FROM growth_websites')) result=params[0]===record.organizationId && params[1]===record.websiteId ? [{status:'active',verified_at:'2026-10-01',auto_publish_enabled:state.publishing,automation_enabled:state.automation}] : [];
        else if(sql.includes('FROM growth_content_records')) {
          assert.match(sql,/organization_id=\? AND website_id=\? AND id=\?/);
          result=params[0]===record.organizationId && params[1]===record.websiteId && params[2]===record.id ? [{version:data.record.version,record_json:JSON.stringify(data.record)}] : [];
        } else if(sql.includes('FROM growth_content_policies')) {
          assert.deepEqual(params,[record.organizationId,record.websiteId,record.contentType]);result=[{enabled:state.policy,auto_publish:state.policy}];
        } else if(sql.includes('FROM growth_connector_health')) {
          assert.deepEqual(params,[record.organizationId,record.websiteId,'site']);
          result=[{organization_id:record.organizationId,website_id:record.websiteId,channel:'site',status:state.health,checked_at:state.checkedAt,expires_at:state.expiresAt}];
        } else if(sql.includes('FROM growth_ai_reservations')) result=params[0]===record.organizationId && params[1]===state.reservationSite ? [{status:state.reservationStatus,content_type:record.contentType,actual_cost_minor:state.actualCost,id:params[2]}] : [];
        else if(sql.includes('FROM growth_content_events')) {
          assert.deepEqual(params.slice(0,3),[record.organizationId,record.websiteId,record.id]);
          const approved={...record,stage:'approved',version:record.version-1,eventIds:record.eventIds.slice(0,-1)};delete approved.schedule;
          result=!state.approvalEventMissing && params[3]===record.eventIds.at(-2) ? [{event_id:params[3],actor_id:state.approvalEventActor,occurred_at:record.approval!.at,version:approved.version,record_json:JSON.stringify(approved)}] : [];
        }
        else if(sql.includes('FROM growth_sessions')) result=params[0]===bridge.request.sessionTokenHash ? [{user_id:'requestor1',disabled:state.userDisabled,role:state.requestorRole,revoked_at:state.sessionRevoked?'revoked':null,expires_at:state.sessionExpires}] : [];
        else if(sql.includes('FROM growth_publication_authorization_events')) result=data.issuanceAudit.has(String(params[1]))?[{request_key:params[1]}]:[];
        else if(sql.startsWith('INSERT INTO growth_content_authorizations')) {if(data.issuedAuth)throw duplicate();data.issuedAuth=JSON.parse(String(params[10]));result={affectedRows:1};}
        else if(sql.startsWith('INSERT INTO growth_publication_authorization_events')) {if(data.issuanceAudit.has(String(params[3])))throw duplicate();data.issuanceAudit.set(String(params[3]),params);result={affectedRows:1};}
        else if(sql.includes('FROM growth_content_authorizations')) result=params[0]===record.organizationId && params[1]===record.websiteId && params[2]===state.approval.id ? [{authorization_json:JSON.stringify(state.approval),revoked_at:state.approvalRevoked?'revoked':null,consumed_at:data.consumed?'consumed':null}] : [];
        else if(sql.includes('FROM growth_memberships') && params.length===2) result=state.membership?[{user_id:record.approval!.actorId,role:state.approverRole,disabled:0}]:[];
        else if(sql.includes('FROM growth_memberships')) result=state.membership ? [{user_id:'requestor1',role:state.requestorRole,disabled:state.userDisabled},{user_id:record.approval!.actorId,role:state.approverRole,disabled:0}] : [];
        else if(sql.includes('FROM growth_publication_policy_revisions')) result=[{revision:state.policyRevision,feature_enabled:state.feature}];
        else if(sql.includes('FROM growth_publication_destinations')) result=params[2]===state.destination.id ? [{...state.destination,enabled:state.destination.enabled?1:0}] : [];
        else if(sql.includes('FROM growth_connector_attestations')) result=[{signed_json:JSON.stringify(state.attestation),revoked_at:state.connectorRevoked?'revoked':null}];
        else if(sql.includes('FROM growth_connector_issuer_state')) result=[{revision:state.trustRevision,revoked:state.issuerRevoked}];
        else if(sql.startsWith('UPDATE growth_content_authorizations')) {const matches=!data.consumed && !state.approvalRevoked; if(matches)data.consumed=true;result={affectedRows:matches?1:0};}
        else if(sql.startsWith('INSERT INTO growth_publication_authorization_uses')) {const key=String(params[2]);if(data.authorizationUses.has(key) || [...data.authorizationUses.values()].some(v=>v[0]===params[0] && v[1]===params[1] && v[3]===params[3] && v[10]===params[10]))throw duplicate();data.authorizationUses.set(key,params);result={affectedRows:1};}
        else if(sql.includes('FROM growth_publication_claims')) {
          assert.match(sql,/organization_id=\? AND website_id=\? AND content_id=\? AND channel=\?/);
          result=data.claim && params[0]===data.claim.organization_id && params[1]===data.claim.website_id && params[2]===data.claim.content_id && params[3]===data.claim.channel && (params.length===4 || params[4]===data.claim.claim_hash) ? [data.claim] : [];
        } else if(sql.includes('FROM growth_publication_observations')) {
          const found=data.observations.get(JSON.stringify(params)); result=found?[found]:[];
        } else if(sql.startsWith('INSERT INTO growth_content_events')) {
          const key=JSON.stringify(params.slice(0,4)); if(data.events.has(key))throw duplicate();
          data.events.set(key,params); result={affectedRows:1};
        } else if(sql.startsWith('UPDATE growth_content_records')) {
          assert.match(sql,/AND version=\?/);
          const matches=params[3]===record.organizationId && params[4]===record.websiteId && params[5]===record.id && params[6]===data.record.version;
          if(matches)data.record=JSON.parse(String(params[2])); result={affectedRows:matches?1:0};
        } else if(sql.startsWith('INSERT INTO growth_publication_claims')) {
          if(data.claim)throw duplicate();
          data.claim={organization_id:String(params[0]),website_id:String(params[1]),content_id:String(params[2]),channel:String(params[3]),claim_hash:String(params[4]),reservation_id:String(params[5]),status:String(params[6])}; result={affectedRows:1};
        } else if(sql.startsWith('UPDATE growth_publication_claims')) {
          const matches=data.claim && params[3]===data.claim.organization_id && params[4]===data.claim.website_id && params[5]===data.claim.content_id && params[6]===data.claim.channel && params[7]===data.claim.claim_hash && params[8]===data.claim.status;
          if(matches && data.claim){data.claim.status=String(params[0]);data.claim.provider_id=params[1] as string|null;data.claim.publication_url=params[2] as string|null;}
          result={affectedRows:matches?1:0};
        } else if(sql.startsWith('INSERT INTO growth_publication_observations')) {
          const key=JSON.stringify([params[0],params[4],params[5]]);if(data.observations.has(key))throw duplicate();data.observations.set(key,{payload_hash:params[6]});result={affectedRows:1};
        } else throw Error('UNEXPECTED_SYNTHETIC_SQL: '+sql);
        return [result,[]];
      }
    };
  }} as unknown as Pool;
  return {pool,state,bridge,snapshot:()=>structuredClone(data)};
}
