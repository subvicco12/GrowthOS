import type { ContentRecord } from './content-lifecycle';

export interface PublicationGate {
  organizationId: string; websiteId: string; channel: string;
  globalPaused: boolean; publishingEnabled: boolean; connectorVerified: boolean;
  reservationId: string | null; approvalVerified: boolean;
}
export interface PublicationClaim {
  organizationId: string; websiteId: string; contentId: string; channel: string;
  idempotencyKey: string; reservationId: string;
}
export interface PublicationClaimStore {
  /** Durable, unique claim on organization/site/content/channel; returns false on any prior attempt. */
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
  const claim = {
    organizationId: record.organizationId, websiteId: record.websiteId, contentId: record.id,
    channel: gate.channel, idempotencyKey: `publish:${record.organizationId}:${record.websiteId}:${record.id}:${gate.channel}`,
    reservationId: gate.reservationId
  };
  if (!(await store.claimOnce(claim))) throw Error('PUBLICATION_ALREADY_CLAIMED_CHECK_REMOTE');
  return { status: 'prepared', claim };
}
