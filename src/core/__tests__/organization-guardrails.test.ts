import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWebsiteAdminAccess } from '../admin-website-access';

test('organization boundaries reject foreign memberships', () => {
  assert.throws(() => assertWebsiteAdminAccess({
    userId: 'member', organizationId: 'other', role: 'owner', active: true
  }, 'selected', 'register'), /UNAUTHORIZED_ORGANIZATION/);
});

test('viewers cannot register websites', () => {
  assert.throws(() => assertWebsiteAdminAccess({
    userId: 'member', organizationId: 'selected', role: 'viewer', active: true
  }, 'selected', 'register'), /INSUFFICIENT_ROLE/);
});

test('inactive and missing memberships cannot access organization', () => {
  assert.throws(() => assertWebsiteAdminAccess(null, 'selected', 'read'), /UNAUTHORIZED_ORGANIZATION/);
  assert.throws(() => assertWebsiteAdminAccess({
    userId: 'member', organizationId: 'selected', role: 'owner', active: false
  }, 'selected', 'read'), /UNAUTHORIZED_ORGANIZATION/);
});

test('all roles can read their own organization', () => {
  for (const role of ['owner', 'admin', 'editor', 'viewer'] as const) {
    assert.doesNotThrow(() => assertWebsiteAdminAccess({
      userId: 'member', organizationId: 'selected', role, active: true
    }, 'selected', 'read'));
  }
});

test('only owners and admins can register websites', () => {
  for (const role of ['owner', 'admin', 'editor', 'viewer'] as const) {
    const check = () => assertWebsiteAdminAccess({
      userId: 'member', organizationId: 'selected', role, active: true
    }, 'selected', 'register');
    if (role === 'owner' || role === 'admin') assert.doesNotThrow(check);
    else assert.throws(check, /INSUFFICIENT_ROLE/);
  }
});

test('foreign organization cannot be accessed even for read-only requests', () => {
  assert.throws(() => assertWebsiteAdminAccess({
    userId: 'member', organizationId: 'foreign', role: 'owner', active: true
  }, 'selected', 'read'), /UNAUTHORIZED_ORGANIZATION/);
});
