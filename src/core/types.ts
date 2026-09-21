export type SiteStatus = 'active' | 'paused' | 'maintenance' | 'disconnected';
export type UserRole = 'owner' | 'admin' | 'operator' | 'analyst' | 'viewer';
export type PlanCode = 'free' | 'pro' | 'business';
export type FeatureMode = 'on' | 'off' | 'maintenance' | 'beta' | 'admin_only';
export type FailSafeMode = 'deny' | 'allow_read_only';
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

export interface Entitlement {
  siteId: string;
  featureKey: string;
  mode: FeatureMode;
  freeAccess: boolean;
  proAccess: boolean;
  businessAccess: boolean;
  quotaFree?: number | null;
  quotaPro?: number | null;
  quotaBusiness?: number | null;
  rolloutPercent: number;
  emergencyKill: boolean;
  customerMessage?: string;
  failSafe: FailSafeMode;
  updatedAt: string;
}

export interface FeatureControl {
  id: string;
  siteId: string;
  featureKey: string;
  mode: FeatureMode;
  reason?: string;
  customerMessage?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  actorId?: string;
  siteId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  reason?: string;
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
