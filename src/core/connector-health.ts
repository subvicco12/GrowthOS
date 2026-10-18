/** Shared UI/engine evidence contract. Configuration is never a probe result. */
export type ConnectorState = 'unknown' | 'disconnected' | 'unavailable' | 'verified';
export interface ConnectorHealthEvidence {
  organizationId: string; websiteId: string; channel: string;
  status: ConnectorState; checkedAt: string; expiresAt: string;
}
export interface ConnectorHealthView { state: ConnectorState; checkedAt: string | null; reason: string }
export function projectConnectorHealth(scope: { organizationId: string; websiteId: string; channel: string }, evidence: ConnectorHealthEvidence | null, now: number): ConnectorHealthView {
  if (!evidence) return { state: 'unknown', checkedAt: null, reason: 'NO_PERSISTED_HEALTH_CHECK' };
  if (evidence.organizationId !== scope.organizationId || evidence.websiteId !== scope.websiteId || evidence.channel !== scope.channel) {
    return { state: 'unavailable', checkedAt: null, reason: 'CONNECTOR_EVIDENCE_SCOPE_MISMATCH' };
  }
  const checked = Date.parse(evidence.checkedAt), expires = Date.parse(evidence.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(checked) || !Number.isFinite(expires) || checked > now || expires <= now || expires <= checked ||
      !['unknown','disconnected','unavailable','verified'].includes(evidence.status)) {
    return { state: 'unavailable', checkedAt: evidence.checkedAt, reason: 'CONNECTOR_EVIDENCE_STALE_OR_INVALID' };
  }
  return { state: evidence.status, checkedAt: evidence.checkedAt, reason: 'PERSISTED_PROBE_RESULT' };
}
