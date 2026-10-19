import { publicationAuthorizationRequestSchema, type PublicationAuthorizationRequest } from './publication-authorization';
import type { ContentRecord } from './content-lifecycle';

export interface PublicationGate {
  organizationId: string; websiteId: string; channel: string;
  globalPaused: boolean; publishingEnabled: boolean; connectorVerified: boolean;
  reservationId: string | null; approvalVerified: boolean;
  /** Server-only request context; booleans above are preliminary deny gates, never authorization. */
  authorization?: PublicationAuthorizationRequest;
}
export interface PublicationClaim {
  organizationId: string; websiteId: string; contentId: string; channel: string;
  idempotencyKey: string; reservationId: string;
  authorization?: PublicationAuthorizationRequest;
}
export interface PublicationClaimStore {
  /** Must atomically reauthorize current session/membership, content/version, destination, policy,
   * signed connector evidence and reservation; consume approval with the one-time claim and audit.
   * Returns false on any prior attempt. Never dispatches a provider. */
  claimOnce(claim: PublicationClaim): Promise<boolean>;
}
export type PreparedPublication = { status: 'prepared'; claim: PublicationClaim };

/** Reserves a single outbound intent. Does not call a provider or activate publishing. */
export async function preparePublication(record: ContentRecord, gate: PublicationGate, store: PublicationClaimStore, now: string): Promise<PreparedPublication> {
  if (record.organizationId !== gate.organizationId || record.websiteId !== gate.websiteId) throw Error('PUBLICATION_SCOPE_DENIED');
  if (record.stage === 'publication_unknown') throw Error('REMOTE_STATUS_CHECK_REQUIRED');
  if (record.stage !== 'scheduled' || !record.schedule || !record.approval || !record.quality) throw Error('PUBLICATION_NOT_APPROVED');
  if (gate.globalPaused || !gate.publishingEnabled) throw Error('PUBLISHING_DISABLED');
  if (!gate.connectorVerified || gate.channel !== record.schedule.channel) throw Error('CONNECTOR_UNAVAILABLE');
  if (!gate.approvalVerified || !gate.reservationId) throw Error('APPROVAL_OR_RESERVATION_REQUIRED');
  if (!Number.isFinite(Date.parse(now)) || Date.parse(now) < Date.parse(record.schedule.at)) throw Error('SCHEDULE_NOT_DUE');
  const authorization = publicationAuthorizationRequestSchema.parse(gate.authorization);
  if (authorization.contentVersion !== record.version) throw Error('APPROVAL_CONTENT_VERSION_DENIED');
  const claim = {
    organizationId: record.organizationId, websiteId: record.websiteId, contentId: record.id,
    channel: gate.channel, idempotencyKey: `publish:${record.organizationId}:${record.websiteId}:${record.id}:${gate.channel}`,
    reservationId: gate.reservationId, authorization
  };
  if (!(await store.claimOnce(claim))) throw Error('PUBLICATION_ALREADY_CLAIMED_CHECK_REMOTE');
  // Session digests are never returned as part of a prepared intent.
  const { authorization: _context, ...publicClaim } = claim;
  return { status: 'prepared', claim: publicClaim };
}
