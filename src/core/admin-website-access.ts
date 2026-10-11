export type GrowthRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type WebsiteAdminAction = 'read' | 'register' | 'change_budget' | 'enable_automation' | 'approve' | 'publish';

export interface AuthenticatedMembership {
  userId: string;
  organizationId: string;
  role: GrowthRole;
  active: boolean;
}

/** The caller must obtain this membership from trusted server-side authentication, not request JSON. */
export function assertWebsiteAdminAccess(
  membership: AuthenticatedMembership | null,
  organizationId: string,
  action: WebsiteAdminAction
): void {
  if (!membership || !membership.active || !membership.userId ||
      membership.organizationId !== organizationId || !organizationId) {
    throw new Error('UNAUTHORIZED_ORGANIZATION');
  }
  const allowed: Record<WebsiteAdminAction, readonly GrowthRole[]> = {
    read: ['owner', 'admin', 'editor', 'viewer'],
    register: ['owner', 'admin'],
    change_budget: ['owner', 'admin'],
    enable_automation: ['owner'],
    approve: ['owner', 'admin', 'editor'],
    publish: ['owner', 'admin', 'editor']
  };
  if (!allowed[action].includes(membership.role)) throw new Error('INSUFFICIENT_ROLE');
}
