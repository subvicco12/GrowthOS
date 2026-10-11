import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWebsiteAdminAccess, type AuthenticatedMembership } from '../admin-website-access';

const owner: AuthenticatedMembership = {
  userId: 'u1', organizationId: 'o1', role: 'owner', active: true
};

test('website read, draft registration and production controls require distinct roles', () => {
  assert.doesNotThrow(() => assertWebsiteAdminAccess({ ...owner, role: 'viewer' }, 'o1', 'read'));
  assert.throws(() => assertWebsiteAdminAccess({ ...owner, role: 'viewer' }, 'o1', 'register'), /INSUFFICIENT_ROLE/);
  assert.doesNotThrow(() => assertWebsiteAdminAccess({ ...owner, role: 'admin' }, 'o1', 'register'));
  assert.throws(() => assertWebsiteAdminAccess({ ...owner, role: 'admin' }, 'o1', 'enable_automation'), /INSUFFICIENT_ROLE/);
  assert.doesNotThrow(() => assertWebsiteAdminAccess(owner, 'o1', 'enable_automation'));
  assert.throws(() => assertWebsiteAdminAccess({ ...owner, active: false }, 'o1', 'read'), /UNAUTHORIZED_ORGANIZATION/);
  assert.throws(() => assertWebsiteAdminAccess(owner, 'o2', 'read'), /UNAUTHORIZED_ORGANIZATION/);
});
