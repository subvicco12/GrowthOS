import { randomUUID } from 'node:crypto';
import type { AuditEvent } from './types';

export interface AuditSink { append(event: AuditEvent): Promise<void>; }

export async function recordAudit(sink: AuditSink, event: Omit<AuditEvent,'id'|'createdAt'>): Promise<void> {
  await sink.append({
    ...event,
    before: redactAuditValue(event.before),
    after: redactAuditValue(event.after),
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  });
}

export interface FeatureChangeAuditInput {
  actorId?: string;
  siteId: string;
  featureKey: string;
  reason: string;
  before: unknown;
  after: unknown;
}

export function createFeatureChangeAuditEvent(input: FeatureChangeAuditInput): AuditEvent {
  if (!input.reason.trim()) throw new Error('FEATURE_CHANGE_REASON_REQUIRED');
  const event: Omit<AuditEvent,'id'|'createdAt'> = {
    actorId: input.actorId,
    siteId: input.siteId,
    action: 'feature_control.changed',
    resourceType: 'feature_control',
    resourceId: input.featureKey,
    reason: input.reason,
    before: input.before,
    after: {...(typeof input.after === 'object' && input.after ? input.after as Record<string,unknown> : {value:input.after}), reason:input.reason},
  };
  return {...event,before:redactAuditValue(event.before),after:redactAuditValue(event.after),id:randomUUID(),createdAt:new Date().toISOString()};
}

export async function recordFeatureChange(sink: AuditSink, input: FeatureChangeAuditInput): Promise<void> {
  await sink.append(createFeatureChangeAuditEvent(input));
}

export function redactAuditValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactAuditValue);
  const sensitive = /secret|password|token|authorization|api[_-]?key|cookie/i;
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,val]) => [key,sensitive.test(key)?'[REDACTED]':redactAuditValue(val)]));
}
