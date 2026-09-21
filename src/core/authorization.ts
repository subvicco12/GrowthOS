import type { UserRole } from './types';

const rank: Record<UserRole, number> = {
  viewer: 10,
  analyst: 20,
  operator: 30,
  admin: 40,
  owner: 50,
};

export const permissions = {
  siteRead: 'viewer',
  analyticsRead: 'analyst',
  runAudit: 'operator',
  changeFeatureState: 'admin',
  manageSite: 'admin',
  manageUsers: 'owner',
  manageAiBudget: 'owner',
  approveRecommendation: 'admin',
} as const satisfies Record<string, UserRole>;

export type Permission = keyof typeof permissions;

export interface AuthorizationContext {
  actorId: string;
  siteId: string;
  role: UserRole;
}

export function hasMinimumRole(actual: UserRole, required: UserRole): boolean {
  return rank[actual] >= rank[required];
}

export function assertMinimumRole(actual: UserRole, required: UserRole): void {
  if (!hasMinimumRole(actual, required)) throw new Error('FORBIDDEN');
}

export function assertPermission(context: AuthorizationContext, permission: Permission): void {
  if (!context.actorId || !context.siteId) throw new Error('AUTHORIZATION_CONTEXT_REQUIRED');
  assertMinimumRole(context.role, permissions[permission]);
}

export function assertSameSite(context: AuthorizationContext, resourceSiteId: string): void {
  if (context.siteId !== resourceSiteId) throw new Error('CROSS_SITE_ACCESS_DENIED');
}
