import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { connectorEnvelopeSchema, siteSnapshotSchema, type SiteSnapshot } from './connector';

export interface HeartbeatRequest {
  url: string;
  headers: Record<string,string>;
  body: string;
}

export function buildConnectorHeartbeat(input:{controlPlaneUrl:string;siteId:string;kind:string;secret:string;snapshot:SiteSnapshot;now?:Date}):HeartbeatRequest {
  if(input.secret.length<32) throw new Error('CONNECTOR_SECRET_TOO_SHORT');
  const snapshot=siteSnapshotSchema.parse(input.snapshot);
  const timestamp=(input.now??new Date()).toISOString();
  const nonce=randomBytes(24).toString('hex');
  const requestId=randomUUID();
  const body=JSON.stringify(snapshot);
  const envelope=connectorEnvelopeSchema.parse({siteId:input.siteId,timestamp,nonce,requestId,signature:'0'.repeat(64)});
  const canonical=[envelope.siteId,envelope.timestamp,envelope.nonce,envelope.requestId,body].join('\n');
  const signature=createHmac('sha256',input.secret).update(canonical).digest('hex');
  const url=new URL('/wp-json/growthos/v1/connectors/heartbeat',input.controlPlaneUrl);
  url.searchParams.set('site_id',envelope.siteId);url.searchParams.set('kind',input.kind);
  return {url:url.toString(),body,headers:{'content-type':'application/json','x-growthos-timestamp':timestamp,'x-growthos-nonce':nonce,'x-growthos-request-id':requestId,'x-growthos-signature':signature}};
}
