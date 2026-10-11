import test from 'node:test';
import assert from 'node:assert/strict';
import { exactUnsigned } from '../../server/mysql-integer';

test('preserves large integers', () => {
  assert.equal(exactUnsigned('9007199254740993'), BigInt('9007199254740993'));
  assert.equal(exactUnsigned(0), BigInt(0));
});

test('rejects unsafe values', () => {
  assert.throws(() => exactUnsigned(Number.MAX_SAFE_INTEGER + 1));
  assert.throws(() => exactUnsigned(-1));
});
