import { createHmac, timingSafeEqual } from 'node:crypto';
import { connectorEnvelopeSchema } from './connector';
const MAX_CLOCK_SKEW_MS=5*60*1000;
export interface NonceStore { consume(siteId:string,nonce:string,expiresAt:Date):Promise<boolean>; }
export function canonicalConnectorPayload(input:{siteId:string;timestamp:string;nonce:string;requestId:string},body:string):string{return [input.siteId,input.timestamp,input.nonce,input.requestId,body].join('\n');}
export function verifyConnectorSignature(payload:string,signature:string,secret:string):boolean {
  if(!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected=createHmac('sha256',secret).update(payload).digest();
  const provided=Buffer.from(signature,'hex');
  return provided.length===expected.length && timingSafeEqual(provided,expected);
}
export async function authenticateConnector(rawEnvelope:unknown,rawBody:string,secret:string,nonces:NonceStore):Promise<{siteId:string;requestId:string}> {
  if(!secret||secret.length<32) throw new Error('INVALID_CONNECTOR_SECRET');
  if(Buffer.byteLength(rawBody,'utf8')>1_048_576) throw new Error('CONNECTOR_BODY_TOO_LARGE');
  const envelope=connectorEnvelopeSchema.parse(rawEnvelope);
  const timestamp=Date.parse(envelope.timestamp);
  const now=Date.now();
  if(!Number.isFinite(timestamp)||timestamp<now-MAX_CLOCK_SKEW_MS) throw new Error('STALE_CONNECTOR_REQUEST');
  if(timestamp>now+30_000) throw new Error('FUTURE_CONNECTOR_REQUEST');
  const payload=canonicalConnectorPayload(envelope,rawBody);
  if(!verifyConnectorSignature(payload,envelope.signature,secret)) throw new Error('INVALID_CONNECTOR_SIGNATURE');
  const consumed=await nonces.consume(envelope.siteId,envelope.nonce,new Date(timestamp+MAX_CLOCK_SKEW_MS));
  if(!consumed) throw new Error('CONNECTOR_REPLAY_DETECTED');
  return {siteId:envelope.siteId,requestId:envelope.requestId};
}
