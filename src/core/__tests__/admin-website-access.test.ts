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
