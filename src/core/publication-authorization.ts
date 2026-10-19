import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ContentRecord } from './content-lifecycle';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const publicationAuthorizationRequestSchema = z.object({
  authorizationId: id, sessionTokenHash: hash, contentVersion: z.number().int().nonnegative().safe(), destinationId: id
}).strict();
export type PublicationAuthorizationRequest = z.infer<typeof publicationAuthorizationRequestSchema>;
export const destinationTarget = z.string().max(2048).url().refine(value => {
  const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.href === value;
});
export const publicationAuthorizationSchema = z.object({
  schemaVersion: z.literal(1), id, organizationId: id, websiteId: id, contentId: id,
  contentVersion: z.number().int().nonnegative().safe(), contentHash: hash,
  channel: id, destinationId: id, destinationRevision: id, destinationTarget,
  reservationId: id, approvalDecisionId: id, decision: z.literal('approved'), purpose: z.literal('content_publication'),
  approverId: id, approvedAt: z.string().datetime(), issuedAt: z.string().datetime(), expiresAt: z.string().datetime(), policyHash: hash
}).strict();
export type PublicationAuthorization = z.infer<typeof publicationAuthorizationSchema>;
export interface PublicationPolicySnapshot {
  revision: string; globalPaused: boolean; siteActive: boolean; websiteVerified: boolean;
  automationEnabled: boolean; publishingEnabled: boolean; featureEnabled: boolean; contentPublishingEnabled: boolean;
}
export interface CurrentPublicationMember { organizationId: string; userId: string; role: string; disabled: boolean }
export interface PublicationDestination { organizationId: string; websiteId: string; channel: string; id: string; revision: string; target: string; enabled: boolean }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export const contentAuthorizationHash = (record: ContentRecord) => createHash('sha256').update(canonical(record)).digest('hex');
export const publicationPolicyHash = (record: ContentRecord, policy: PublicationPolicySnapshot) =>
  createHash('sha256').update(canonical([record.organizationId,record.websiteId,record.contentType,policy])).digest('hex');
const permitted = (m: CurrentPublicationMember, org: string) => Boolean(m.userId) && m.organizationId === org && m.disabled === false && ['owner','admin'].includes(m.role);
/** Called with locked authoritative records, not browser claims or a cached role. */
export function assertPublicationAuthorization(input: {
  record: ContentRecord; channel: string; reservationId: string; request: PublicationAuthorizationRequest; authorization: unknown;
  policy: PublicationPolicySnapshot; requestor: CurrentPublicationMember; approver: CurrentPublicationMember;
  destination: PublicationDestination; now: number;
}): PublicationAuthorization {
  const { record:r,policy:p,requestor,approver,destination:d,now } = input;
  const request = publicationAuthorizationRequestSchema.parse(input.request);
  const a = publicationAuthorizationSchema.parse(input.authorization);
  if (!Number.isFinite(now) || !permitted(requestor,r.organizationId) || !permitted(approver,r.organizationId) || approver.userId !== a.approverId) throw Error('PUBLICATION_MEMBERSHIP_DENIED');
  if (p.globalPaused !== false || !p.revision || [p.siteActive,p.websiteVerified,p.automationEnabled,p.publishingEnabled,p.featureEnabled,p.contentPublishingEnabled].some(v => v !== true)) throw Error('PUBLISHING_DISABLED');
  if (a.id !== request.authorizationId || a.organizationId !== r.organizationId || a.websiteId !== r.websiteId || a.contentId !== r.id || a.contentVersion !== r.version || request.contentVersion !== r.version || a.contentHash !== contentAuthorizationHash(r) || a.reservationId !== input.reservationId) throw Error('APPROVAL_CONTENT_SCOPE_OR_VERSION_DENIED');
  if (a.channel !== input.channel || r.schedule?.channel !== input.channel || a.destinationId !== request.destinationId ||
      d.organizationId !== r.organizationId || d.websiteId !== r.websiteId || d.channel !== input.channel || d.id !== a.destinationId || d.revision !== a.destinationRevision || d.target !== a.destinationTarget || d.enabled !== true) throw Error('APPROVAL_DESTINATION_DENIED');
  if (r.stage !== 'scheduled' || !r.approval || r.approval.actorId !== a.approverId || Date.parse(r.approval.at) !== Date.parse(a.approvedAt) ||
      !r.quality || ![r.quality.factual,r.quality.original,r.quality.rightsCleared,r.quality.disclosureChecked].every(v => v === true) ||
      !r.schedule || !Number.isFinite(Date.parse(r.schedule.at)) || Date.parse(r.schedule.at) > now) throw Error('PUBLICATION_NOT_APPROVED');
  const approved = Date.parse(a.approvedAt), issued = Date.parse(a.issuedAt), expires = Date.parse(a.expiresAt);
  if (approved > issued || issued > now || expires <= now || expires <= issued || expires - issued > 86400000 || a.policyHash !== publicationPolicyHash(r,p)) throw Error('APPROVAL_EXPIRED_OR_POLICY_CHANGED');
  return a;
}
