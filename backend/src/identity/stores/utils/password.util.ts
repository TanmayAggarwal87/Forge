import { scryptSync, timingSafeEqual } from 'crypto';
import type { User } from '../../identity.types';

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

export function isPasswordValid(user: User, password: string): boolean {
  const candidateHash = Buffer.from(hashPassword(password, user.passwordSalt));
  const expectedHash = Buffer.from(user.passwordHash);

  return (
    candidateHash.length === expectedHash.length &&
    timingSafeEqual(candidateHash, expectedHash)
  );
}
