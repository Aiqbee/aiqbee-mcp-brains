import { describe, it, expect, beforeEach } from 'vitest';
import { TokenStorage } from './token-storage.js';

/** In-memory SecretStorage stub */
function createMockSecretStorage() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key),
    store: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    onDidChange: () => ({ dispose: () => {} }),
    _store: store,
  };
}

describe('TokenStorage', () => {
  let secrets: ReturnType<typeof createMockSecretStorage>;
  let storage: TokenStorage;

  beforeEach(() => {
    secrets = createMockSecretStorage();
    storage = new TokenStorage(secrets as any);
  });

  it('returns undefined when no token stored', async () => {
    expect(await storage.getAccessToken()).toBeUndefined();
  });

  it('stores and retrieves access token', async () => {
    await storage.setAccessToken('tok-123');
    expect(await storage.getAccessToken()).toBe('tok-123');
  });

  it('stores and retrieves refresh token', async () => {
    await storage.setRefreshToken('ref-456');
    expect(await storage.getRefreshToken()).toBe('ref-456');
  });

  it('stores and retrieves auth type', async () => {
    await storage.setAuthType('microsoft');
    expect(await storage.getAuthType()).toBe('microsoft');
  });

  it('stores and retrieves user JSON', async () => {
    const json = JSON.stringify({ id: '1', email: 'test@example.com' });
    await storage.setUserJson(json);
    expect(await storage.getUserJson()).toBe(json);
  });

  it('hasTokens returns false when empty', async () => {
    expect(await storage.hasTokens()).toBe(false);
  });

  it('hasTokens returns true after setting token', async () => {
    await storage.setAccessToken('tok-abc');
    expect(await storage.hasTokens()).toBe(true);
  });

  it('hasTokens returns false for empty string token', async () => {
    await storage.setAccessToken('');
    expect(await storage.hasTokens()).toBe(false);
  });

  it('clear removes all stored values', async () => {
    await storage.setAccessToken('tok');
    await storage.setRefreshToken('ref');
    await storage.setAuthType('email');
    await storage.setUserJson('{}');

    await storage.clear();

    expect(await storage.getAccessToken()).toBeUndefined();
    expect(await storage.getRefreshToken()).toBeUndefined();
    expect(await storage.getAuthType()).toBeUndefined();
    expect(await storage.getUserJson()).toBeUndefined();
    expect(await storage.hasTokens()).toBe(false);
  });
});
