import { describe, it, expect, beforeEach } from 'vitest';
import {
  migrateLegacyConnection,
  LEGACY_CONNECTION_KEY,
  LEGACY_SECRET_KEYS,
  MIGRATION_MARKER_KEY,
} from './migration.js';
import { CLOUD_SERVER_ID, SERVERS_STORAGE_KEY, type ServerEntry } from './connection.js';
import { sessionSecretKey } from '../auth/token-storage.js';
import { createMemento, createSecrets } from '../__mocks__/test-helpers.js';

const USER = { id: 'u1', givenName: 'Ada', familyName: 'L', email: 'ada@example.com' };

function legacySecrets(authType = 'microsoft') {
  return createSecrets({
    [LEGACY_SECRET_KEYS.accessToken]: 'legacy-access',
    [LEGACY_SECRET_KEYS.refreshToken]: 'legacy-refresh',
    [LEGACY_SECRET_KEYS.authType]: authType,
    [LEGACY_SECRET_KEYS.userJson]: JSON.stringify(USER),
  });
}

const LEGACY_HIVE = {
  backendType: 'hive',
  baseUrl: 'https://hive.example.com',
  mcpBaseUrl: 'https://hive.example.com/',
  authProviders: ['entra'],
  label: 'hive.example.com',
};

describe('migrateLegacyConnection', () => {
  beforeEach(() => {
    process.env.VITE_API_URL = 'https://api.aiqbee.com';
  });

  it('moves a legacy cloud session to the cloud server and deletes the legacy keys', async () => {
    const memento = createMemento();
    const secrets = legacySecrets();

    await migrateLegacyConnection(memento as any, secrets);

    const servers = memento._store.get(SERVERS_STORAGE_KEY) as ServerEntry[];
    expect(servers.map((s) => s.id)).toEqual([CLOUD_SERVER_ID]);
    expect(JSON.parse(secrets._data.get(sessionSecretKey(CLOUD_SERVER_ID))!)).toEqual({
      accessToken: 'legacy-access',
      refreshToken: 'legacy-refresh',
      authType: 'microsoft',
      user: USER,
    });
    for (const key of Object.values(LEGACY_SECRET_KEYS)) {
      expect(secrets._data.has(key)).toBe(false);
    }
    expect(memento._store.get(MIGRATION_MARKER_KEY)).toBe(true);
  });

  it('moves a legacy Hive connection and its session to a new Hive server, leaving cloud signed out', async () => {
    const memento = createMemento({ [LEGACY_CONNECTION_KEY]: LEGACY_HIVE });
    const secrets = legacySecrets('google');

    await migrateLegacyConnection(memento as any, secrets);

    const servers = memento._store.get(SERVERS_STORAGE_KEY) as ServerEntry[];
    const hive = servers.find((s) => s.kind === 'hive')!;
    expect(hive).toMatchObject({
      baseUrl: 'https://hive.example.com',
      mcpBaseUrl: 'https://hive.example.com',
      authProviders: ['entra'],
      origin: 'user',
    });
    expect(JSON.parse(secrets._data.get(sessionSecretKey(hive.id))!).accessToken).toBe('legacy-access');
    expect(secrets._data.has(sessionSecretKey(CLOUD_SERVER_ID))).toBe(false);
    expect(memento._store.has(LEGACY_CONNECTION_KEY)).toBe(false);
  });

  it('works with no legacy data at all', async () => {
    const memento = createMemento();
    const secrets = createSecrets();

    await migrateLegacyConnection(memento as any, secrets);

    expect((memento._store.get(SERVERS_STORAGE_KEY) as ServerEntry[]).map((s) => s.id)).toEqual([CLOUD_SERVER_ID]);
    expect(secrets._data.size).toBe(0);
  });

  it('is a no-op on the second run', async () => {
    const memento = createMemento({ [LEGACY_CONNECTION_KEY]: LEGACY_HIVE });
    const secrets = legacySecrets();
    await migrateLegacyConnection(memento as any, secrets);
    const after = JSON.stringify([...memento._store.entries()]);

    // Stale legacy keys reappearing (e.g. an old version running) are ignored once migrated.
    await secrets.store(LEGACY_SECRET_KEYS.accessToken, 'stale');
    await migrateLegacyConnection(memento as any, secrets);

    expect(JSON.stringify([...memento._store.entries()])).toBe(after);
    expect(secrets._data.get(LEGACY_SECRET_KEYS.accessToken)).toBe('stale');
  });

  it('does not overwrite a session that already exists for the target server', async () => {
    const memento = createMemento();
    const secrets = legacySecrets();
    secrets._data.set(sessionSecretKey(CLOUD_SERVER_ID), JSON.stringify({ accessToken: 'newer' }));

    await migrateLegacyConnection(memento as any, secrets);

    expect(JSON.parse(secrets._data.get(sessionSecretKey(CLOUD_SERVER_ID))!).accessToken).toBe('newer');
  });

  it('keeps all legacy data when a write fails part-way, so it can retry', async () => {
    const memento = createMemento({ [LEGACY_CONNECTION_KEY]: LEGACY_HIVE });
    const secrets = legacySecrets();
    memento.update.mockRejectedValueOnce(new Error('disk full'));

    await expect(migrateLegacyConnection(memento as any, secrets)).rejects.toThrow('disk full');

    expect(memento._store.get(LEGACY_CONNECTION_KEY)).toEqual(LEGACY_HIVE);
    expect(secrets._data.get(LEGACY_SECRET_KEYS.accessToken)).toBe('legacy-access');
    expect(memento._store.has(MIGRATION_MARKER_KEY)).toBe(false);

    // The retry succeeds and produces exactly one Hive entry.
    await migrateLegacyConnection(memento as any, secrets);
    const servers = memento._store.get(SERVERS_STORAGE_KEY) as ServerEntry[];
    expect(servers.filter((s) => s.kind === 'hive')).toHaveLength(1);
    expect(secrets._data.has(LEGACY_SECRET_KEYS.accessToken)).toBe(false);
  });

  it('ignores an unreadable legacy user record', async () => {
    const memento = createMemento();
    const secrets = legacySecrets();
    secrets._data.set(LEGACY_SECRET_KEYS.userJson, '{broken');

    await migrateLegacyConnection(memento as any, secrets);

    const session = JSON.parse(secrets._data.get(sessionSecretKey(CLOUD_SERVER_ID))!);
    expect(session.accessToken).toBe('legacy-access');
    expect(session.user).toBeUndefined();
  });
});
