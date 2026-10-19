import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { destinationTarget, type PublicationDestination } from '../core/publication-authorization';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const evidenceSchema = z.object({
  issuer: id, keyId: id, eventId: id, trustRevision: id, organizationId: id, websiteId: id, channel: id,
  destinationId: id, destinationRevision: id, destinationTarget,
  status: z.enum(['unknown','disconnected','unavailable','verified']), capabilities: z.array(z.enum(['read','publish'])).max(2),
  checkedAt: z.string().datetime(), expiresAt: z.string().datetime()
}).strict();
export type ConnectorAttestation = z.infer<typeof evidenceSchema>;
export type SignedConnectorAttestation = { evidence: ConnectorAttestation; signature: string };
export interface TrustedConnectorIssuer {
  id: string; keyId: string; secret: Buffer; revoked: boolean; trustRevision: string;
  organizationId: string; websiteId: string; channel: string; destinationId: string;
  destinationRevision: string; destinationTarget: string;
}
export interface CurrentConnectorTrust { issuer: string; keyId: string; revision: string; revoked: boolean }
export function connectorEvidencePayload(e: ConnectorAttestation) {
  return JSON.stringify([e.issuer,e.keyId,e.eventId,e.trustRevision,e.organizationId,e.websiteId,e.channel,e.destinationId,e.destinationRevision,e.destinationTarget,e.status,[...e.capabilities].sort(),e.checkedAt,e.expiresAt]);
}
/** Empty trust by default. Current revocation must be read inside the claim transaction. */
export class ConnectorEvidenceVerifier {
  private readonly issuers: TrustedConnectorIssuer[];
  constructor(issuers: readonly TrustedConnectorIssuer[] = []) {
    if (issuers.some(i => !Buffer.isBuffer(i.secret) || i.secret.length < 32) || new Set(issuers.map(i => JSON.stringify([i.id,i.keyId]))).size !== issuers.length) throw Error('INVALID_CONNECTOR_TRUST');
    this.issuers = issuers.map(i => ({ ...i, secret: Buffer.from(i.secret) }));
  }
  verify(input: SignedConnectorAttestation, destination: PublicationDestination, current: CurrentConnectorTrust, now: number) {
    const parsed = evidenceSchema.safeParse(input?.evidence);
    if (!parsed.success || typeof input?.signature !== 'string' || !/^[a-f0-9]{64}$/.test(input.signature)) throw Error('CONNECTOR_EVIDENCE_INVALID');
    const e = parsed.data, issuer = this.issuers.find(i => i.id === e.issuer && i.keyId === e.keyId);
    if (!issuer || issuer.revoked !== false || current.revoked !== false || current.issuer !== e.issuer || current.keyId !== e.keyId || current.revision !== e.trustRevision || issuer.trustRevision !== e.trustRevision) throw Error('CONNECTOR_TRUST_REVOKED_OR_UNKNOWN');
    for (const [field, expected] of Object.entries({ organizationId:destination.organizationId, websiteId:destination.websiteId, channel:destination.channel, destinationId:destination.id, destinationRevision:destination.revision, destinationTarget:destination.target })) {
      if (e[field as keyof ConnectorAttestation] !== expected || issuer[field as keyof TrustedConnectorIssuer] !== expected) throw Error('CONNECTOR_EVIDENCE_SCOPE_DENIED');
    }
    const checked = Date.parse(e.checkedAt), expires = Date.parse(e.expiresAt);
    if (!Number.isFinite(now) || checked > now || expires <= now || expires <= checked || expires - checked > 300000) throw Error('CONNECTOR_EVIDENCE_EXPIRED');
    const payload = connectorEvidencePayload(e), expected = createHmac('sha256',issuer.secret).update(payload).digest();
    if (!timingSafeEqual(expected,Buffer.from(input.signature,'hex'))) throw Error('CONNECTOR_SIGNATURE_INVALID');
    if (!destination.enabled || e.status !== 'verified' || !e.capabilities.includes('publish') || new Set(e.capabilities).size !== e.capabilities.length) throw Error('CONNECTOR_NOT_PUBLISH_VERIFIED');
    return { evidence:e, payloadHash:createHash('sha256').update(payload).digest('hex') };
  }
}
