import assert from 'node:assert/strict';
import type { Pool } from 'mysql2/promise';
import type { ContentRecord } from '../../content-lifecycle';

type ClaimRow = { organization_id:string; website_id:string; content_id:string; channel:string; claim_hash:string; reservation_id:string; status:string; provider_id?:string|null; publication_url?:string|null };
/** Serialized SQL simulator, not a MariaDB server or SQL parser. Models rollback and uniqueness only. */
export function contentSQLFixture(record: ContentRecord, now: number) {
  let data = { record:structuredClone(record), claim:null as ClaimRow|null, events:new Map<string,unknown[]>(), observations:new Map<string,{payload_hash:unknown}>() };
  let tail: Promise<void> = Promise.resolve();
  const state = { commits:0,rollbacks:0,queries:[] as {sql:string;params:unknown[]}[], failSQL:'', health:'verified', checkedAt:new Date(now-60000).toISOString(), expiresAt:new Date(now+60000).toISOString(), paused:0, publishing:1, automation:1, policy:1, reservationSite:record.websiteId };
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
        if(sql.includes('FROM growth_organization_budgets')) result=params[0]===record.organizationId ? [{globally_paused:state.paused}] : [];
        else if(sql.includes('FROM growth_websites')) result=params[0]===record.organizationId && params[1]===record.websiteId ? [{status:'active',verified_at:'2026-10-01',auto_publish_enabled:state.publishing,automation_enabled:state.automation}] : [];
        else if(sql.includes('FROM growth_content_records')) {
          assert.match(sql,/organization_id=\? AND website_id=\? AND id=\?/);
          result=params[0]===record.organizationId && params[1]===record.websiteId && params[2]===record.id ? [{version:data.record.version,record_json:JSON.stringify(data.record)}] : [];
        } else if(sql.includes('FROM growth_content_policies')) {
          assert.deepEqual(params,[record.organizationId,record.websiteId,record.contentType]);result=[{enabled:state.policy,auto_publish:state.policy}];
        } else if(sql.includes('FROM growth_connector_health')) {
          assert.deepEqual(params,[record.organizationId,record.websiteId,'site']);
          result=[{organization_id:record.organizationId,website_id:record.websiteId,channel:'site',status:state.health,checked_at:state.checkedAt,expires_at:state.expiresAt}];
        } else if(sql.includes('FROM growth_ai_reservations')) result=params[0]===record.organizationId && params[1]===state.reservationSite ? [{status:'completed',content_type:record.contentType,actual_cost_minor:'20'}] : [];
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
  return {pool,state,snapshot:()=>structuredClone(data)};
}
