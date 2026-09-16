import type { AuditEvent } from './types';

export interface AuditSink { append(event: AuditEvent): Promise<void>; }

export async function recordAudit(sink: AuditSink, event: Omit<AuditEvent,'id'|'createdAt'>): Promise<void> {
  await sink.append({
    ...event,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
}

export function redactAuditValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactAuditValue);
  const sensitive = /secret|password|token|authorization|api[_-]?key|cookie/i;
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,val]) => [key,sensitive.test(key)?'[REDACTED]':redactAuditValue(val)]));
}
