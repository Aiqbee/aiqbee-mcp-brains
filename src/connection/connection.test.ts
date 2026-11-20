import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ConnectionManager,
  CLOUD_SERVER_ID,
  DuplicateServerError,
  SERVERS_STORAGE_KEY,
  normaliseUrl,
  type ServerEntry,
} from './connection.js';
import { NetworkError } from '../api/api-client.js';
import { createMemento, hiveDiscovery, jsonResponse } from '../__mocks__/test-helpers.js';

const originalViteApiUrl = process.env.VITE_API_URL;

function hiveEntry(overrides: Partial<ServerEntry> = {}): ServerEntry {
  return {
    id: 'hive-1',
    kind: 'hive',
    label: 'Team Hive',
    baseUrl: 'https://hive.example.com',
    mcpBaseUrl: 'https://hive.example.com',
    authProviders: ['entra'],
    origin: 'user',
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ConnectionManager', () => {
  let memento: ReturnType<typeof createMemento>;
  let manager: ConnectionManager;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.VITE_API_URL = 'https://api.aiqbee.com';
    memento = createMemento();
    manager = new ConnectionManager(memento as any);
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(hiveDiscovery()));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    manager.dispose();
    vi.unstubAllGlobals();
    if (originalViteApiUrl === undefined) {
      delete process.env.VITE_API_URL;
    } else {
      process.env.VITE_API_URL = originalViteApiUrl;
    }
  });

  describe('list', () => {
    it('always contains the built-in cloud entry first', () => {
      const [cloud] = manager.list();
      expect(cloud).toMatchObject({
        id: CLOUD_SERVER_ID,
        kind: 'cloud',
        label: 'Aiqbee Cloud',
        baseUrl: 'https://api.aiqbee.com',
        mcpBaseUrl: 'https://mcp.aiqbee.com',
        origin: 'builtin',
      });
    });

    it('loads stored Hive entries and rebuilds the cloud URLs from the current build', () => {
      memento._store.set(SERVERS_STORAGE_KEY, [
        { ...manager.get(CLOUD_SERVER_ID)!, label: 'My Cloud', baseUrl: 'https://stale.example.com' },
        hiveEntry(),
      ]);
      const reloaded = new ConnectionManager(memento as any);

      expect(reloaded.list().map((s) => s.id)).toEqual([CLOUD_SERVER_ID, 'hive-1']);
      expect(reloaded.get(CLOUD_SERVER_ID)).toMatchObject({ label: 'My Cloud', baseUrl: 'https://api.aiqbee.com' });
      reloaded.dispose();
    });
  });

  describe('addHive', () => {
    it('runs discovery and stores the new entry', async () => {
      const entry = await manager.addHive('hive.example.com');

      expect(fetchMock).toHaveBeenCalledWith('https://hive.example.com/api/vscode/discovery', expect.anything());
      expect(entry).toMatchObject({
        kind: 'hive',
        label: 'hive.example.com',
        baseUrl: 'https://hive.example.com',
        mcpBaseUrl: 'https://hive.example.com',
        authProviders: ['entra', 'google'],
        version: '1.4.0',
        origin: 'user',
      });
      expect(memento._store.get(SERVERS_STORAGE_KEY)).toContainEqual(entry);
      expect(manager.list()).toHaveLength(2);
    });

    it('uses a custom label when given', async () => {
      const entry = await manager.addHive('hive.example.com', { label: '  Engineering  ' });
      expect(entry.label).toBe('Engineering');
    });

    it('rejects a URL that is already configured, ignoring case and trailing slash', async () => {
      await manager.addHive('https://hive.example.com');
      await expect(manager.addHive('HTTPS://HIVE.EXAMPLE.COM/')).rejects.toBeInstanceOf(DuplicateServerError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps only supported auth providers', async () => {
      fetchMock.mockResolvedValue(jsonResponse(hiveDiscovery({ authProviders: ['entra', 'saml', 'local'] })));
      const entry = await manager.addHive('hive.example.com');
      expect(entry.authProviders).toEqual(['entra']);
    });

    it('adds a server with no supported provider instead of failing', async () => {
      fetchMock.mockResolvedValue(jsonResponse(hiveDiscovery({ authProviders: ['local'] })));
      const entry = await manager.addHive('hive.example.com');
      expect(entry.authProviders).toEqual([]);
      expect(manager.get(entry.id)).toBeDefined();
    });

    it('throws NetworkError when the server cannot be reached', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(manager.addHive('hive.example.com')).rejects.toBeInstanceOf(NetworkError);
      expect(manager.list()).toHaveLength(1);
    });

    it('throws when discovery returns an error status', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 404));
      await expect(manager.addHive('hive.example.com')).rejects.toThrow('returned 404');
    });

    it('throws when the server is not a Hive Server', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ backendType: 'cloud' }));
      await expect(manager.addHive('hive.example.com')).rejects.toThrow('did not identify as a Hive Server');
    });

    it('fires onDidChangeServers', async () => {
      const listener = vi.fn();
      manager.onDidChangeServers(listener);
      await manager.addHive('hive.example.com');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('rename', () => {
    it('updates the label and persists it', async () => {
      const entry = await manager.addHive('hive.example.com');
      await manager.rename(entry.id, '  Prod Hive ');
      expect(manager.get(entry.id)?.label).toBe('Prod Hive');
      expect((memento._store.get(SERVERS_STORAGE_KEY) as ServerEntry[]).find((s) => s.id === entry.id)?.label)
        .toBe('Prod Hive');
    });

    it('rejects an empty name', async () => {
      await expect(manager.rename(CLOUD_SERVER_ID, '   ')).rejects.toThrow('cannot be empty');
    });
  });

  describe('remove', () => {
    it('removes a user-added Hive Server and fires onDidRemoveServer', async () => {
      const entry = await manager.addHive('hive.example.com');
      const removed = vi.fn();
      manager.onDidRemoveServer(removed);

      await manager.remove(entry.id);

      expect(manager.get(entry.id)).toBeUndefined();
      expect(removed).toHaveBeenCalledWith(expect.objectContaining({ id: entry.id }));
    });

    it('refuses to remove the cloud entry', async () => {
      await expect(manager.remove(CLOUD_SERVER_ID)).rejects.toThrow('cannot be removed');
    });

    it('refuses to remove a settings-managed entry', async () => {
      await manager.syncSettingServers([{ url: 'https://hive.example.com' }]);
      const entry = manager.findByUrl('https://hive.example.com')!;
      await expect(manager.remove(entry.id)).rejects.toThrow('aiqbee.servers setting');
    });
  });

  describe('refreshDiscovery', () => {
    it('updates the providers and clears needsDiscovery', async () => {
      memento._store.set(SERVERS_STORAGE_KEY, [hiveEntry({ authProviders: [], needsDiscovery: true })]);
      const reloaded = new ConnectionManager(memento as any);

      const entry = await reloaded.refreshDiscovery('hive-1');

      expect(entry.authProviders).toEqual(['entra', 'google']);
      expect(entry.needsDiscovery).toBeUndefined();
      reloaded.dispose();
    });

    it('leaves the cloud entry alone', async () => {
      await manager.refreshDiscovery(CLOUD_SERVER_ID);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('syncSettingServers', () => {
    it('adds new settings entries as managed servers', async () => {
      await manager.syncSettingServers([{ url: 'https://hive.example.com', label: 'Corp' }]);
      expect(manager.findByUrl('https://hive.example.com')).toMatchObject({ origin: 'setting', label: 'Corp' });
    });

    it('adds an unreachable settings entry marked as needing discovery', async () => {
      fetchMock.mockRejectedValue(new TypeError('offline'));
      await manager.syncSettingServers([{ url: 'https://hive.example.com' }]);
      expect(manager.findByUrl('https://hive.example.com')).toMatchObject({
        origin: 'setting',
        needsDiscovery: true,
        authProviders: [],
      });
    });

    it('drops settings entries that are no longer listed and fires onDidRemoveServer', async () => {
      await manager.syncSettingServers([{ url: 'https://hive.example.com' }]);
      const removed = vi.fn();
      manager.onDidRemoveServer(removed);

      await manager.syncSettingServers([]);

      expect(manager.findByUrl('https://hive.example.com')).toBeUndefined();
      expect(removed).toHaveBeenCalledTimes(1);
    });

    it('does not take over a server the user already added', async () => {
      const entry = await manager.addHive('hive.example.com');
      await manager.syncSettingServers([{ url: 'https://hive.example.com' }]);
      expect(manager.get(entry.id)?.origin).toBe('user');
      expect(manager.list()).toHaveLength(2);
    });

    it('does nothing when the settings are unchanged', async () => {
      await manager.syncSettingServers([{ url: 'https://hive.example.com' }]);
      memento.update.mockClear();
      await manager.syncSettingServers([{ url: 'https://hive.example.com' }]);
      expect(memento.update).not.toHaveBeenCalled();
    });
  });
});

describe('normaliseUrl', () => {
  it('adds https and strips trailing slashes', () => {
    expect(normaliseUrl(' hive.example.com/// ')).toBe('https://hive.example.com');
  });

  it('keeps a path prefix', () => {
    expect(normaliseUrl('https://example.com/hive/')).toBe('https://example.com/hive');
  });

  it('rejects HTTP for remote hosts', () => {
    expect(() => normaliseUrl('http://hive.example.com')).toThrow('must use HTTPS');
  });

  it('allows HTTP for localhost', () => {
    expect(normaliseUrl('http://localhost:8000')).toBe('http://localhost:8000');
    expect(normaliseUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
  });

  it('rejects credentials in the URL', () => {
    expect(() => normaliseUrl('https://user:pass@hive.example.com')).toThrow('username or password');
  });

  it('rejects invalid URLs', () => {
    expect(() => normaliseUrl('https://exa mple.com')).toThrow('Invalid URL');
  });
});
