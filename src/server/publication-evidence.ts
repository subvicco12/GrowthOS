import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import type { PublicationClaim } from '../core/publication-handoff';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const observationSchema = z.object({
  issuer: id, eventId: id, organizationId: id, websiteId: id, contentId: id,
  channel: z.string().min(1).max(80), reservationId: id, claimHash: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  result: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('published'), providerId: z.string().min(1).max(200), url: z.string().max(2048).url().refine(value => {
      const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password;
    }) }).strict(),
    z.object({ kind: z.literal('absent') }).strict(), z.object({ kind: z.literal('unknown') }).strict()
  ])
}).strict();
export type PublicationObservation = z.infer<typeof observationSchema>;
export type SignedPublicationObservation = { observation: PublicationObservation; signature: string };
export interface TrustedPublicationIssuer {
  id: string; secret: Buffer; revoked: boolean;
  organizationId: string; websiteId: string; channel: string;
}
export const publicationClaimHash = (claim: PublicationClaim): string => createHash('sha256').update(claim.idempotencyKey).digest('hex');
/** Fixed canonical field order. No credentials/environment/default trust list is loaded. */
export function publicationEvidencePayload(o: PublicationObservation): string {
  return JSON.stringify([o.issuer,o.eventId,o.organizationId,o.websiteId,o.contentId,o.channel,o.reservationId,o.claimHash,o.issuedAt,o.expiresAt,
    o.result.kind,o.result.kind === 'published' ? o.result.providerId : null,o.result.kind === 'published' ? o.result.url : null]);
}
export class PublicationEvidenceVerifier {
  private readonly issuers: TrustedPublicationIssuer[];
  constructor(issuers: readonly TrustedPublicationIssuer[]) {
    this.issuers = issuers.map(issuer => ({ ...issuer, secret: Buffer.from(issuer.secret) }));
    if (new Set(issuers.map(x => x.id)).size !== issuers.length || issuers.some(x => x.secret.length < 32)) throw Error('INVALID_PUBLICATION_TRUST');
  }
  verify(input: SignedPublicationObservation, claim: PublicationClaim, now: number): { observation: PublicationObservation; payloadHash: string } {
    const parsed = observationSchema.safeParse(input?.observation);
    if (!parsed.success || typeof input.signature !== 'string' || !/^[a-f0-9]{64}$/.test(input.signature)) throw Error('PUBLICATION_EVIDENCE_INVALID');
    const o = parsed.data;
    const issuer = this.issuers.find(x => x.id === o.issuer && !x.revoked && x.organizationId === claim.organizationId && x.websiteId === claim.websiteId && x.channel === claim.channel);
    if (!issuer || o.organizationId !== claim.organizationId || o.websiteId !== claim.websiteId || o.contentId !== claim.contentId || o.channel !== claim.channel ||
        o.reservationId !== claim.reservationId || o.claimHash !== publicationClaimHash(claim)) throw Error('PUBLICATION_EVIDENCE_SCOPE_DENIED');
    const issued = Date.parse(o.issuedAt), expires = Date.parse(o.expiresAt);
    if (!Number.isFinite(now) || issued > now || expires <= now || expires <= issued || expires - issued > 300000) throw Error('PUBLICATION_EVIDENCE_EXPIRED');
    const payload = publicationEvidencePayload(o);
    const expected = createHmac('sha256',issuer.secret).update(payload).digest();
    if (!timingSafeEqual(expected,Buffer.from(input.signature,'hex'))) throw Error('PUBLICATION_EVIDENCE_SIGNATURE_INVALID');
    return { observation:o, payloadHash:createHash('sha256').update(payload).digest('hex') };
  }
}
