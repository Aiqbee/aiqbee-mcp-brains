import { describe, it, expect } from 'vitest';
import { tokenExpiresAt } from './jwt.js';

const encode = (payload: unknown) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

describe('tokenExpiresAt', () => {
  it('reads exp as milliseconds', () => {
    expect(tokenExpiresAt(encode({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });

  it('returns undefined for opaque, malformed or exp-less tokens', () => {
    expect(tokenExpiresAt('opaque-token')).toBeUndefined();
    expect(tokenExpiresAt('a.%%%.c')).toBeUndefined();
    expect(tokenExpiresAt(encode({ sub: 'u' }))).toBeUndefined();
    expect(tokenExpiresAt(encode({ exp: 'soon' }))).toBeUndefined();
  });
});
