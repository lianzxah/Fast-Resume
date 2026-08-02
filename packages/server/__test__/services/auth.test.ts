import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../../src/services/auth';

describe('auth service', () => {
  it('signs and verifies a JWT payload', () => {
    const token = signToken({ userId: 'user_1', username: 'tester', role: 'admin' });
    const payload = verifyToken(token);

    expect(payload).toMatchObject({ userId: 'user_1', username: 'tester', role: 'admin' });
  });

  it('returns null for invalid tokens', () => {
    expect(verifyToken('invalid-token')).toBeNull();
  });
});
