import type { AuditSink } from './audit';
import { recordFeatureChange } from './audit';
import { assertPermission, assertSameSite, type AuthorizationContext } from './authorization';
import type { FeatureMode } from './types';

export interface FeatureControlChange {
  siteId: string;
  featureKey: string;
  mode: FeatureMode;
  reason: string;
  customerMessage?: string;
}

export interface FeatureControlRepository {
  get(siteId: string, featureKey: string): Promise<unknown>;
  set(change: FeatureControlChange, actorId: string): Promise<unknown>;
}

export async function changeFeatureControl(
  context: AuthorizationContext,
  change: FeatureControlChange,
  repository: FeatureControlRepository,
  audit: AuditSink,
): Promise<unknown> {
  assertPermission(context, 'changeFeatureState');
  assertSameSite(context, change.siteId);
  if (!change.reason.trim()) throw new Error('FEATURE_CHANGE_REASON_REQUIRED');

  const before = await repository.get(change.siteId, change.featureKey);
  const after = await repository.set(change, context.actorId);
  await recordFeatureChange(audit, {
    actorId: context.actorId,
    siteId: change.siteId,
    featureKey: change.featureKey,
    reason: change.reason,
    before,
    after,
  });
  return after;
}
