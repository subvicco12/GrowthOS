import type { UserRole } from './types';

const rank: Record<UserRole, number> = {
  viewer: 10,
  analyst: 20,
  operator: 30,
  admin: 40,
  owner: 50,
};

export function hasMinimumRole(actual: UserRole, required: UserRole): boolean {
  return rank[actual] >= rank[required];
}

export function assertMinimumRole(actual: UserRole, required: UserRole): void {
  if (!hasMinimumRole(actual, required)) {
    throw new Error('FORBIDDEN');
  }
}

export const permissions = {
  siteRead: 'viewer',
  analyticsRead: 'analyst',
  runAudit: 'operator',
  changeFeatureState: 'admin',
  manageSite: 'admin',
  manageUsers: 'owner',
  manageAiBudget: 'owner',
} as const satisfies Record<string, UserRole>;
