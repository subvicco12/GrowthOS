import type {Pool,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import type {ConnectorEvidenceRepository,SequencedConnectorProbe} from './connector-trust';
type Row=RowDataPacket&Record<string,unknown>;
const decoded=(v:unknown)=>typeof v==='string'?JSON.parse(v):v;
function keyParts(key:string):[string,string]{const v=JSON.parse(key);if(!Array.isArray(v)||v.length!==2||v.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x)))throw Error('ISSUER_KEY_INVALID');return v as [string,string];}
/** Dedicated connector writer principal; no authorizations, claims, reservations or activation writes. */
export class MySQLConnectorEvidenceStore implements ConnectorEvidenceRepository {
  readonly capability='connector-evidence-writer' as const;
  constructor(private readonly pool:Pick<Pool,'getConnection'>){}
  async readCurrent(key:string){
    const [issuer,keyId]=keyParts(key),c=await this.pool.getConnection();
    try{
      const [rows]=await c.execute<Row[]>('SELECT h.sequence,h.payload_hash,h.probe_json FROM growth_connector_attestations a JOIN growth_connector_evidence_history h ON h.issuer=a.issuer AND h.key_id=a.key_id AND h.event_id=a.event_id AND h.payload_hash=a.payload_hash WHERE a.issuer=? AND a.key_id=? AND a.revoked_at IS NULL',[issuer,keyId]);
      if(rows.length!==1)return null;
      const sequence=Number(rows[0].sequence);if(!Number.isSafeInteger(sequence)||sequence<=0)throw Error('PROBE_SEQUENCE_CORRUPT');
      return {sequence,hash:String(rows[0].payload_hash),probe:decoded(rows[0].probe_json) as SequencedConnectorProbe};
    }finally{c.release();}
  }
  async commitObservation(input:Parameters<ConnectorEvidenceRepository['commitObservation']>[0]){
    const [issuer,keyId]=keyParts(input.key),e=input.signed.evidence;
    if(e.issuer!==issuer||e.keyId!==keyId)throw Error('PROBE_SCOPE_DENIED');
    const c=await this.pool.getConnection();
    try{
      await c.beginTransaction();
      const [org]=await c.execute<Row[]>('SELECT organization_id FROM growth_organization_budgets WHERE organization_id=? FOR UPDATE',[e.organizationId]);
      const [site]=await c.execute<Row[]>('SELECT id FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE',[e.organizationId,e.websiteId]);
      const [destination]=await c.execute<Row[]>('SELECT revision,target,enabled FROM growth_publication_destinations WHERE organization_id=? AND website_id=? AND id=? AND channel=? FOR UPDATE',[e.organizationId,e.websiteId,e.destinationId,e.channel]);
      const [trust]=await c.execute<Row[]>('SELECT revision,generation,revoked FROM growth_connector_issuer_state WHERE issuer=? AND key_id=? FOR UPDATE',[issuer,keyId]);
      if(org.length!==1||site.length!==1||destination.length!==1||String(destination[0].revision)!==e.destinationRevision||destination[0].target!==e.destinationTarget||Number(destination[0].enabled)!==1||trust.length!==1||trust[0].revision!==e.trustRevision||String(trust[0].generation)!==String(input.probe.generation)||Number(trust[0].revoked)!==0)throw Error('PROBE_CONTEXT_CHANGED');
      const [current]=await c.execute<Row[]>('SELECT issuer,key_id,event_id,sequence,payload_hash,revoked_at FROM growth_connector_attestations WHERE organization_id=? AND website_id=? AND channel=? AND destination_id=? FOR UPDATE',[e.organizationId,e.websiteId,e.channel,e.destinationId]);
      const [history]=await c.execute<Row[]>('SELECT payload_hash,sequence FROM growth_connector_evidence_history WHERE issuer=? AND key_id=? AND event_id=? FOR UPDATE',[issuer,keyId,e.eventId]);
      if(history.length){
        if(history.length!==1||history[0].payload_hash!==input.hash||String(history[0].sequence)!==String(input.sequence)||current.length!==1||current[0].payload_hash!==input.hash||current[0].revoked_at!==null)throw Error('PROBE_EVENT_REPLAY');
        await c.commit();return;
      }
      if(current.length>1 || (current.length===0 ? input.previous!==null : current[0].payload_hash!==input.previous || current[0].revoked_at!==null || current[0].issuer!==issuer || current[0].key_id!==keyId || Number(current[0].sequence)>=input.sequence))throw Error('PROBE_DATABASE_ROLLBACK_OR_CONFLICT');
      const [saved]=await c.execute<ResultSetHeader>('INSERT INTO growth_connector_evidence_history (issuer,key_id,event_id,organization_id,website_id,channel,destination_id,sequence,previous_hash,payload_hash,probe_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[issuer,keyId,e.eventId,e.organizationId,e.websiteId,e.channel,e.destinationId,input.sequence,input.previous,input.hash,JSON.stringify(input.probe)]);
      if(saved.affectedRows!==1)throw Error('PROBE_HISTORY_INSERT_FAILED');
      if(current.length){
        const [updated]=await c.execute<ResultSetHeader>('UPDATE growth_connector_attestations SET event_id=?,sequence=?,payload_hash=?,signed_json=? WHERE organization_id=? AND website_id=? AND channel=? AND destination_id=? AND payload_hash=? AND revoked_at IS NULL',[e.eventId,input.sequence,input.hash,JSON.stringify(input.signed),e.organizationId,e.websiteId,e.channel,e.destinationId,input.previous]);
        if(updated.affectedRows!==1)throw Error('PROBE_POINTER_CONFLICT');
      }else{
        const [inserted]=await c.execute<ResultSetHeader>('INSERT INTO growth_connector_attestations (organization_id,website_id,channel,destination_id,issuer,key_id,event_id,sequence,payload_hash,signed_json) VALUES (?,?,?,?,?,?,?,?,?,?)',[e.organizationId,e.websiteId,e.channel,e.destinationId,issuer,keyId,e.eventId,input.sequence,input.hash,JSON.stringify(input.signed)]);
        if(inserted.affectedRows!==1)throw Error('PROBE_POINTER_INSERT_FAILED');
      }
      // Only a denial projection without the signed destination-bound evidence at claim time.
      await c.execute('INSERT INTO growth_connector_health (organization_id,website_id,channel,status,checked_at,expires_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),checked_at=VALUES(checked_at),expires_at=VALUES(expires_at)',[e.organizationId,e.websiteId,e.channel,e.status,new Date(e.checkedAt),new Date(e.expiresAt)]);
      await c.commit();
    }catch(error){await c.rollback();throw error;}finally{c.release();}
  }
}
