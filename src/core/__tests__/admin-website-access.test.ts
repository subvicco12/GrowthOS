import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWebsiteAdminAccess, type AuthenticatedMembership } from '../admin-website-access';

const member: AuthenticatedMembership = {
  userId: 'user-1', organizationId: 'org-1', role: 'viewer', active: true
};

test('tenant and role checks deny cross-organization and untrusted access', () => {
  assert.doesNotThrow(() => assertWebsiteAdminAccess(member, 'org-1', 'read'));
  assert.throws(() => assertWebsiteAdminAccess(member, 'org-2', 'read'), /UNAUTHORIZED_ORGANIZATION/);
  assert.throws(() => assertWebsiteAdminAccess(null, 'org-1', 'read'), /UNAUTHORIZED_ORGANIZATION/);
  assert.throws(() => assertWebsiteAdminAccess(member, 'org-1', 'change_budget'), /INSUFFICIENT_ROLE/);
  assert.throws(() => assertWebsiteAdminAccess({ ...member, role: 'admin' }, 'org-1', 'enable_automation'), /INSUFFICIENT_ROLE/);
  assert.doesNotThrow(() => assertWebsiteAdminAccess({ ...member, role: 'owner' }, 'org-1', 'enable_automation'));
});

test('internal approval permission is role-checked separately from publication', () => {
  assert.throws(() => assertWebsiteAdminAccess(member, 'org-1', 'approve'), /INSUFFICIENT_ROLE/);
  assert.doesNotThrow(() => assertWebsiteAdminAccess({ ...member, role: 'editor' }, 'org-1', 'approve'));
  assert.doesNotThrow(() => assertWebsiteAdminAccess({ ...member, role: 'admin' }, 'org-1', 'approve'));
  assert.throws(() => assertWebsiteAdminAccess({ ...member, role: 'owner', active: false }, 'org-1', 'approve'), /UNAUTHORIZED_ORGANIZATION/);
  assert.throws(() => assertWebsiteAdminAccess({ ...member, role: 'owner' }, 'org-2', 'approve'), /UNAUTHORIZED_ORGANIZATION/);
});


test('every admin action enforces the complete role matrix', () => {
  const permissions = {
    read: ['owner', 'admin', 'editor', 'viewer'],
    register: ['owner', 'admin'],
    change_budget: ['owner', 'admin'],
    enable_automation: ['owner'],
    approve: ['owner', 'admin', 'editor'],
    publish: ['owner', 'admin', 'editor']
  } as const;
  for (const [action, allowedRoles] of Object.entries(permissions)) {
    for (const role of ['owner', 'admin', 'editor', 'viewer'] as const) {
      const attempt = () => assertWebsiteAdminAccess({ ...member, role }, 'org-1', action as keyof typeof permissions);
      if ((allowedRoles as readonly string[]).includes(role)) {
        assert.doesNotThrow(attempt, `${role} should be allowed to ${action}`);
      } else {
        assert.throws(attempt, /INSUFFICIENT_ROLE/, `${role} must not ${action}`);
      }
    }
  }
});

test('all actions fail closed for inactive, missing and cross-tenant membership', () => {
  const actions = ['read', 'register', 'change_budget', 'enable_automation', 'approve', 'publish'] as const;
  for (const action of actions) {
    assert.throws(() => assertWebsiteAdminAccess(null, 'org-1', action), /UNAUTHORIZED_ORGANIZATION/);
    assert.throws(() => assertWebsiteAdminAccess({ ...member, role: 'owner', active: false }, 'org-1', action), /UNAUTHORIZED_ORGANIZATION/);
    assert.throws(() => assertWebsiteAdminAccess({ ...member, role: 'owner' }, 'org-2', action), /UNAUTHORIZED_ORGANIZATION/);
    assert.throws(() => assertWebsiteAdminAccess({ ...member, role: 'owner' }, '', action), /UNAUTHORIZED_ORGANIZATION/);
  }
});
