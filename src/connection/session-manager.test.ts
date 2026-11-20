import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionManager, CLOUD_SERVER_ID, SERVERS_STORAGE_KEY, type ServerEntry } from './connection.js';
import { SessionManager } from './session-manager.js';
import { sessionSecretKey } from '../auth/token-storage.js';
import { createMemento, createSecrets, flush, hiveDiscovery, jsonResponse } from '../__mocks__/test-helpers.js';

const HIVE: ServerEntry = {
  id: 'hive-1',
  kind: 'hive',
  label: 'Team Hive',
  baseUrl: 'https://hive.example.com',
  mcpBaseUrl: 'https://hive.example.com',
  authProviders: ['entra'],
  origin: 'user',
  addedAt: '2026-01-01T00:00:00.000Z',
};

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** fetch stub that answers by host + path; unknown requests fail like a network error. */
function routeFetch(routes: Record<string, Route>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const { host, pathname } = new URL(url);
    const route = routes[`${host}${pathname}`];
    if (!route) {
      throw new TypeError(`fetch failed: ${url}`);
    }
    return route(url, init);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const brains = (names: string[]) =>
  names.map((name, i) => ({ id: `b${i}`, name, isPersonal: true, allowMCPEditing: true, accessLevel: 2, canWrite: true, canManageAccess: true }));

describe('SessionManager and ServerSession', () => {
  let memento: ReturnType<typeof createMemento>;
  let secrets: ReturnType<typeof createSecrets>;
  let registry: ConnectionManager;
  let manager: SessionManager;

  async function setup(stored: ServerEntry[] = [HIVE], sessions: Record<string, object> = {}) {
    memento = createMemento({ [SERVERS_STORAGE_KEY]: stored });
    secrets = createSecrets(
      Object.fromEntries(Object.entries(sessions).map(([id, s]) => [sessionSecretKey(id), JSON.stringify(s)])),
    );
    registry = new ConnectionManager(memento as any);
    manager = new SessionManager(registry, secrets);
    await manager.initialize();
  }

  beforeEach(() => {
    process.env.VITE_API_URL = 'https://api.aiqbee.com';
  });

  afterEach(() => {
    manager?.dispose();
    registry?.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('creates one session per server and reads each stored sign-in', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 'hive-token', user: { email: 'me@hive' } } });

      expect(manager.all().map((s) => s.serverId)).toEqual([CLOUD_SERVER_ID, 'hive-1']);
      expect(manager.require(CLOUD_SERVER_ID).status).toBe('signedOut');
      expect(manager.require('hive-1').status).toBe('connected');
      expect(manager.require('hive-1').user?.email).toBe('me@hive');
    });

    it('marks a Hive Server with no supported sign-in method as unsupportedAuth', async () => {
      await setup([{ ...HIVE, authProviders: [] }]);
      expect(manager.require('hive-1').status).toBe('unsupportedAuth');
    });

    it('marks an undiscovered settings server with a session as offline', async () => {
      await setup([{ ...HIVE, origin: 'setting', authProviders: [], needsDiscovery: true }], {
        'hive-1': { accessToken: 't' },
      });
      expect(manager.require('hive-1').status).toBe('offline');
    });
  });

  describe('registry changes', () => {
    it('creates a session for an added server and removes it, with its secret, when the server is removed', async () => {
      await setup([]);
      routeFetch({ 'hive.example.com/api/vscode/discovery': () => jsonResponse(hiveDiscovery()) });
      const removed = vi.fn();
      manager.onDidRemoveSession(removed);

      const entry = await registry.addHive('hive.example.com');
      await flush();
      const session = manager.require(entry.id);
      await session.tokenStorage.setSession({ accessToken: 'x' });

      await registry.remove(entry.id);
      await flush();

      expect(manager.get(entry.id)).toBeUndefined();
      expect(secrets._data.has(sessionSecretKey(entry.id))).toBe(false);
      expect(removed).toHaveBeenCalledWith(expect.objectContaining({ id: entry.id }));
    });

    it('fires onDidChange when a server is renamed', async () => {
      await setup();
      const listener = vi.fn();
      manager.onDidChange(listener);

      await registry.rename('hive-1', 'Renamed');
      await flush();

      expect(listener).toHaveBeenCalled();
      expect(manager.require('hive-1').entry.label).toBe('Renamed');
    });
  });

  describe('loadBrains', () => {
    it('loads brains from that server only', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 'hive-token' }, cloud: { accessToken: 'cloud-token' } });
      const fetchMock = routeFetch({
        'hive.example.com/api/brains/with-access': () => jsonResponse(brains(['Hive Brain'])),
        'api.aiqbee.com/api/brains/with-access': () => jsonResponse(brains(['Cloud Brain'])),
      });

      const hiveBrains = await manager.require('hive-1').loadBrains();

      expect(hiveBrains.map((b) => b.name)).toEqual(['Hive Brain']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0][1] as any).headers.Authorization).toBe('Bearer hive-token');
      expect(manager.require(CLOUD_SERVER_ID).brains).toBeUndefined();
    });

    it('shares one request between concurrent callers', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 't' } });
      const fetchMock = routeFetch({ 'hive.example.com/api/brains/with-access': () => jsonResponse([]) });
      const session = manager.require('hive-1');

      await Promise.all([session.loadBrains(), session.loadBrains()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('goes offline but keeps the session and cached brains when the server is unreachable', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 't' } });
      routeFetch({ 'hive.example.com/api/brains/with-access': () => jsonResponse(brains(['Cached'])) });
      const session = manager.require('hive-1');
      await session.loadBrains();

      routeFetch({});
      await expect(session.loadBrains(true)).rejects.toThrow();

      expect(session.status).toBe('offline');
      expect(session.brains?.map((b) => b.name)).toEqual(['Cached']);
      expect(await session.tokenStorage.hasTokens()).toBe(true);
    });

    it('expires only that server when its refresh is rejected', async () => {
      await setup([HIVE], {
        'hive-1': { accessToken: 'old', refreshToken: 'r', authType: 'google' },
        cloud: { accessToken: 'cloud-token' },
      });
      routeFetch({
        'hive.example.com/api/brains/with-access': () => jsonResponse({}, 401),
        'hive.example.com/api/vscode/auth/refresh': () => jsonResponse({}, 401),
      });
      const hive = manager.require('hive-1');

      await expect(hive.loadBrains()).rejects.toThrow('Authentication expired');

      expect(hive.status).toBe('authExpired');
      expect(await hive.tokenStorage.hasTokens()).toBe(false);
      expect(manager.require(CLOUD_SERVER_ID).status).toBe('connected');
      expect(await manager.require(CLOUD_SERVER_ID).tokenStorage.getAccessToken()).toBe('cloud-token');
    });

    it('records a server error so the tree can offer a retry instead of reloading in a loop', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 't' } });
      routeFetch({ 'hive.example.com/api/brains/with-access': () => jsonResponse({}, 500) });
      const session = manager.require('hive-1');

      await expect(session.loadBrains()).rejects.toThrow();

      expect(session.brainsError).toContain('500');
      expect(session.isLoadingBrains).toBe(false);
    });
  });

  describe('refreshToken (timer)', () => {
    it('stays connected on success, goes offline when unreachable, expires when rejected', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 'a', refreshToken: 'r', authType: 'google' } });
      const session = manager.require('hive-1');

      routeFetch({ 'hive.example.com/api/vscode/auth/refresh': () => jsonResponse({ accessToken: 'b', refreshToken: 'r2' }) });
      await session.refreshToken();
      expect(session.status).toBe('connected');
      expect(await session.tokenStorage.getAccessToken()).toBe('b');

      routeFetch({});
      await session.refreshToken();
      expect(session.status).toBe('offline');
      expect(await session.tokenStorage.hasTokens()).toBe(true);

      routeFetch({ 'hive.example.com/api/vscode/auth/refresh': () => jsonResponse({}, 403) });
      await session.refreshToken();
      expect(session.status).toBe('authExpired');
      expect(await session.tokenStorage.hasTokens()).toBe(false);
    });

    it('recovers from offline without signing in again', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 'a', refreshToken: 'r', authType: 'google' } });
      const session = manager.require('hive-1');
      routeFetch({});
      await session.refreshToken();
      expect(session.status).toBe('offline');

      routeFetch({
        'hive.example.com/api/vscode/auth/refresh': () => jsonResponse({ accessToken: 'b' }),
        'hive.example.com/api/brains/with-access': () => jsonResponse(brains(['Back'])),
      });
      await session.refreshToken();

      expect(session.status).toBe('connected');
      expect(session.brains?.map((b) => b.name)).toEqual(['Back']);
    });

    it('the timer refreshes every signed-in server and one failure does not stop the others', async () => {
      vi.useFakeTimers();
      await setup([HIVE], {
        'hive-1': { accessToken: 'a', refreshToken: 'r', authType: 'google' },
        cloud: { accessToken: 'c', refreshToken: 'cr', authType: 'email' },
      });
      routeFetch({
        'hive.example.com/api/vscode/auth/refresh': () => { throw new TypeError('boom'); },
        'api.aiqbee.com/api/auth/refresh': () => jsonResponse({ accessToken: 'c2' }),
      });

      manager.startRefreshTimer(1000);
      await vi.advanceTimersByTimeAsync(1000);

      expect(manager.require('hive-1').status).toBe('offline');
      expect(await manager.require(CLOUD_SERVER_ID).tokenStorage.getAccessToken()).toBe('c2');
    });

    it('skips servers that are not signed in', async () => {
      await setup([HIVE]);
      const fetchMock = routeFetch({});
      await manager.refreshAll();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('refresh (manual)', () => {
    it('re-runs Hive discovery and moves an unsupported server to signed out once it gains a provider', async () => {
      await setup([{ ...HIVE, authProviders: [] }]);
      routeFetch({ 'hive.example.com/api/vscode/discovery': () => jsonResponse(hiveDiscovery()) });
      const session = manager.require('hive-1');

      await session.refresh();

      expect(session.status).toBe('signedOut');
      expect(session.entry.authProviders).toEqual(['entra', 'google']);
    });

    it('reconnects a stored session once the server supports a sign-in method again', async () => {
      await setup([{ ...HIVE, authProviders: [] }], { 'hive-1': { accessToken: 't' } });
      routeFetch({
        'hive.example.com/api/vscode/discovery': () => jsonResponse(hiveDiscovery()),
        'hive.example.com/api/brains/with-access': () => jsonResponse(brains(['Back'])),
      });
      const session = manager.require('hive-1');
      expect(session.status).toBe('unsupportedAuth');

      await session.refresh();

      expect(session.status).toBe('connected');
      expect(session.brains?.map((b) => b.name)).toEqual(['Back']);
    });

    it('keeps "Session expired" after a refresh until the user signs in again', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 'a', refreshToken: 'r', authType: 'google' } });
      routeFetch({ 'hive.example.com/api/vscode/auth/refresh': () => jsonResponse({}, 401) });
      const session = manager.require('hive-1');
      await session.refreshToken();

      routeFetch({ 'hive.example.com/api/vscode/discovery': () => jsonResponse(hiveDiscovery()) });
      await session.refresh();

      expect(session.status).toBe('authExpired');
    });

    it('shows offline when discovery cannot reach the server', async () => {
      await setup();
      routeFetch({});
      const session = manager.require('hive-1');

      await session.refresh();

      expect(session.status).toBe('offline');
    });
  });

  describe('signOut', () => {
    it('signs out of one server only', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 'h' }, cloud: { accessToken: 'c' } });

      await manager.require('hive-1').signOut();

      expect(manager.require('hive-1').status).toBe('signedOut');
      expect(manager.require(CLOUD_SERVER_ID).status).toBe('connected');
      expect(await manager.require(CLOUD_SERVER_ID).tokenStorage.hasTokens()).toBe(true);
    });

    it('stays signed out when a refresh that was running finishes afterwards', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 'old', refreshToken: 'r', authType: 'google' } });
      let finishRefresh!: () => void;
      routeFetch({
        'hive.example.com/api/brains/with-access': (_url, init) =>
          (init?.headers as Record<string, string> | undefined)?.Authorization === 'Bearer new'
            ? jsonResponse(brains(['A']))
            : jsonResponse({}, 401),
        'hive.example.com/api/vscode/auth/refresh': () => new Promise<Response>((resolve) => {
          finishRefresh = () => resolve(jsonResponse({ accessToken: 'new', refreshToken: 'r2' }));
        }),
      });
      const hive = manager.require('hive-1');

      const load = hive.loadBrains().catch(() => undefined);
      await vi.waitFor(() => expect(finishRefresh).toBeDefined());
      await hive.signOut();
      finishRefresh();
      await load;

      expect(await hive.tokenStorage.hasTokens()).toBe(false);
      expect(hive.status).toBe('signedOut');
      expect(hive.hasSession).toBe(false);
    });
  });

  describe('signIn', () => {
    it('refuses to start on a server with no supported sign-in method', async () => {
      await setup([{ ...HIVE, authProviders: [] }]);
      await expect(manager.require('hive-1').signIn('entra')).rejects.toThrow('no sign-in method');
    });

    it('returns to signed out if the sign-in fails', async () => {
      await setup([HIVE]);
      const session = manager.require('hive-1');
      vi.spyOn(session.authService, 'signInWithMicrosoft').mockRejectedValue(new Error('nope'));

      await expect(session.signIn('entra')).rejects.toThrow('nope');

      expect(session.status).toBe('signedOut');
    });
  });
});
