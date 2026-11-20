import { describe, it, expect, beforeEach } from 'vitest';
import { TokenStorage, sessionSecretKey } from './token-storage.js';
import { createSecrets } from '../__mocks__/test-helpers.js';

describe('TokenStorage', () => {
  let secrets: ReturnType<typeof createSecrets>;
  let cloud: TokenStorage;
  let hive: TokenStorage;

  beforeEach(() => {
    secrets = createSecrets();
    cloud = new TokenStorage(secrets, 'cloud');
    hive = new TokenStorage(secrets, 'hive-1');
  });

  it('stores the whole session in one secret keyed by server id', async () => {
    await cloud.setSession({ accessToken: 'a', refreshToken: 'r', authType: 'microsoft' });

    expect(secrets.store).toHaveBeenCalledTimes(1);
    expect(JSON.parse(secrets._data.get(sessionSecretKey('cloud'))!)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      authType: 'microsoft',
    });
    expect(await cloud.getAccessToken()).toBe('a');
    expect(await cloud.getRefreshToken()).toBe('r');
    expect(await cloud.getAuthType()).toBe('microsoft');
    expect(await cloud.hasTokens()).toBe(true);
  });

  it('keeps sessions for different servers separate', async () => {
    await cloud.setSession({ accessToken: 'cloud-token' });
    await hive.setSession({ accessToken: 'hive-token' });

    expect(await cloud.getAccessToken()).toBe('cloud-token');
    expect(await hive.getAccessToken()).toBe('hive-token');
  });

  it('clear() removes only its own server', async () => {
    await cloud.setSession({ accessToken: 'cloud-token' });
    await hive.setSession({ accessToken: 'hive-token' });

    await hive.clear();

    expect(await hive.hasTokens()).toBe(false);
    expect(await cloud.getAccessToken()).toBe('cloud-token');
  });

  it('updateTokens keeps the auth type and user, and the old refresh token if none is given', async () => {
    const user = { id: 'u', givenName: 'A', familyName: 'B', email: 'a@b.c' } as any;
    await cloud.setSession({ accessToken: 'old', refreshToken: 'r1', authType: 'email', user });

    await cloud.updateTokens('new');

    expect(await cloud.getSession()).toEqual({ accessToken: 'new', refreshToken: 'r1', authType: 'email', user });
  });

  it('serialises concurrent updates so none is lost', async () => {
    await cloud.setSession({ accessToken: 'start', refreshToken: 'r', authType: 'google' });

    await Promise.all([cloud.updateTokens('first', 'r1'), cloud.updateTokens('second')]);

    expect(await cloud.getSession()).toEqual({ accessToken: 'second', refreshToken: 'r1', authType: 'google' });
  });

  it('reads a corrupt or empty secret as signed out', async () => {
    secrets._data.set(sessionSecretKey('cloud'), '{not json');
    expect(await cloud.getSession()).toBeUndefined();

    secrets._data.set(sessionSecretKey('cloud'), JSON.stringify({ accessToken: '' }));
    expect(await cloud.hasTokens()).toBe(false);
  });
});
