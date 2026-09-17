export type SiteStatus = 'active' | 'paused' | 'maintenance' | 'disconnected';
export type UserRole = 'owner' | 'admin' | 'operator' | 'analyst' | 'viewer';
export type FeatureState = 'enabled' | 'disabled' | 'maintenance';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Site {
  id: string;
  name: string;
  domain: string;
  platform: 'wordpress' | 'custom';
  status: SiteStatus;
  connectorVersion?: string;
  lastSeenAt?: string;
}

export interface FeatureControl {
  id: string;
  siteId: string;
  featureKey: string;
  state: FeatureState;
  reason?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  siteId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
}

export interface Job {
  id: string;
  siteId?: string;
  type: string;
  status: JobStatus;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
}
