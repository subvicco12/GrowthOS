import { randomBytes, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(callbackScrypt);
const KEY_BYTES = 64;
const OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const PREFIX = 'scrypt-v1';

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw new Error('INVALID_PASSWORD_LENGTH');
  }
  const salt = randomBytes(32);
  const derived = await scrypt(password, salt, KEY_BYTES, OPTIONS) as Buffer;
  return [PREFIX, salt.toString('hex'), derived.toString('hex')].join('$');
}

/** Malformed hashes return false, never authenticate. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 1024 || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX ||
      !/^[0-9a-f]{64}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) return false;
  const actual = await scrypt(password, Buffer.from(parts[1], 'hex'), KEY_BYTES, OPTIONS) as Buffer;
  return timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
}
