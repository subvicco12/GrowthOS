import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { websiteDomainSchema } from '../core/website-domain-schema';
export function validateSyntheticConnectorEndpoint(domain: string, endpoint: string): void {
  const url=new URL(endpoint);
  if(!websiteDomainSchema.safeParse(domain).success||isIP(domain)||/(?:^|\.)(localhost|local|internal)$/.test(domain)||
    url.protocol!=='https:'||url.hostname!==domain||url.username||url.password||url.port||url.search||url.hash||
    endpoint!==`https://${domain}/wp-json/growthos/v1/health`)throw Error('CONNECTOR_CONFIGURATION_INVALID');
}
function key(hex: string): Buffer { if(!/^[a-f0-9]{64}$/.test(hex))throw Error('CONNECTOR_KEY_UNAVAILABLE');return Buffer.from(hex,'hex'); }
export function encryptConnectorKey(secret: string, master: string, binding: string): string {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(master),iv);cipher.setAAD(Buffer.from(binding));
  const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),ciphertext.toString('hex')].join('.');
}
export function decryptConnectorKey(value: string, master: string, binding: string): string {
  const [iv,tag,data,...extra]=value.split('.');if(extra.length||!iv||!tag||!data||!/^[a-f0-9]{24}$/.test(iv)||!/^[a-f0-9]{32}$/.test(tag)||!/^[a-f0-9]+$/.test(data))throw Error('CONNECTOR_CREDENTIAL_INVALID');
  const cipher=createDecipheriv('aes-256-gcm',key(master),Buffer.from(iv,'hex'));cipher.setAAD(Buffer.from(binding));cipher.setAuthTag(Buffer.from(tag,'hex'));
  return Buffer.concat([cipher.update(Buffer.from(data,'hex')),cipher.final()]).toString('utf8');
}
const payloadSchema=z.object({connectorId:z.string().uuid(),websiteId:z.string().uuid(),endpoint:z.string(),nonce:z.string().uuid(),
  observedAt:z.string().datetime(),status:z.literal('ok'),mode:z.literal('synthetic'),capabilities:z.tuple([z.literal('read_only')])}).strict();
export type SyntheticHealthPayload=z.infer<typeof payloadSchema>;
export function signSyntheticHealth(payload: SyntheticHealthPayload, secret: string): string {return createHmac('sha256',secret).update(JSON.stringify(payload)).digest('hex');}
export interface SyntheticHealthAdapter { read(payload: SyntheticHealthPayload, requestSignature: string, secret: string): Promise<{payload: unknown; signature: string}> }
export const localSyntheticHealthAdapter: SyntheticHealthAdapter={async read(payload,requestSignature,secret){
  if(signSyntheticHealth(payload,secret)!==requestSignature)throw Error('SYNTHETIC_AUTHENTICATION_FAILED');
  // No fetch, DNS lookup, socket, WordPress code, or external transport exists in this adapter.
  return {payload,signature:signSyntheticHealth(payload,secret)};
}};
export function verifySyntheticHealth(raw: unknown, signature: string, expected: SyntheticHealthPayload, secret: string): void {
  const payload=payloadSchema.parse(raw);
  if(JSON.stringify(payload)!==JSON.stringify(expected)||!/^[a-f0-9]{64}$/.test(signature)||
    !timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(signSyntheticHealth(payload,secret),'hex')))throw Error('CONNECTOR_HEALTH_AUTHENTICATION_FAILED');
}
