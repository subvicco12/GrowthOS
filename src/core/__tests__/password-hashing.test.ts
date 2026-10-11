import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../../server/password-hashing';

test('password hashes are salted and verify only matching passwords', async () => {
  const password = 'correct horse battery staple';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrect password', first), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
});
test('password hashing rejects short passwords', async () => {
  await assert.rejects(hashPassword('short'), /INVALID_PASSWORD_LENGTH/);
});
