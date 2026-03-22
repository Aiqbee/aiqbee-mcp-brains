import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConnectionManager } from './connection.js';

function createMockGlobalState() {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string) => store.get(key) as T | undefined,
    update: vi.fn(async (key: string, value: unknown) => {
      if (value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    }),
    keys: () => [...store.keys()],
    _store: store,
  };
}

const originalViteApiUrl = process.env.VITE_API_URL;

describe('ConnectionManager', () => {
  let globalState: ReturnType<typeof createMockGlobalState>;
  let manager: ConnectionManager;

  beforeEach(() => {
    globalState = createMockGlobalState();
    manager = new ConnectionManager(globalState as any);
    process.env.VITE_API_URL = 'https://api.aiqbee.com';
  });

  afterEach(() => {
    manager.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalViteApiUrl === undefined) {
      delete process.env.VITE_API_URL;
    } else {
      process.env.VITE_API_URL = originalViteApiUrl;
    }
  });

  describe('getConnection', () => {
    it('returns cloud connection by default', () => {
      const conn = manager.getConnection();

      expect(conn.backendType).toBe('cloud');
      expect(conn.baseUrl).toBe('https://api.aiqbee.com');
      expect(conn.mcpBaseUrl).toBe('https://mcp.aiqbee.com');
      expect(conn.authProviders).toEqual(['entra', 'google', 'email']);
      expect(conn.label).toBe('Aiqbee Cloud');
    });

    it('returns stored hive connection from globalState', () => {
      const hiveConn = {
        backendType: 'hive' as const,
        baseUrl: 'https://hive.company.com',
        mcpBaseUrl: 'https://hive.company.com',
        authProviders: ['entra'],
        label: 'hive.company.com',
      };
      globalState._store.set('aiqbee-connection', hiveConn);

      const conn = manager.getConnection();

      expect(conn.backendType).toBe('hive');
      expect(conn.baseUrl).toBe('https://hive.company.com');
    });

    it('caches the connection after connectToCloud', async () => {
      // After explicitly connecting, the result is cached
      await manager.connectToCloud();
      const a = manager.getConnection();
      const b = manager.getConnection();
      expect(a).toBe(b);
    });
  });

  describe('connectToHive', () => {
    it('fetches discovery and persists hive connection', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          backendType: 'hive',
          version: '1.0.0',
          authProviders: ['entra', 'google'],
          mcpBaseUrl: 'https://hive.example.com/',
        }),
      }));

      const conn = await manager.connectToHive('hive.example.com');

      expect(conn.backendType).toBe('hive');
      expect(conn.baseUrl).toBe('https://hive.example.com');
      expect(conn.mcpBaseUrl).toBe('https://hive.example.com');
      expect(conn.authProviders).toEqual(['entra', 'google']);
      expect(conn.label).toBe('hive.example.com');
      expect(globalState.update).toHaveBeenCalledWith('aiqbee-connection', conn);
    });

    it('adds https:// when no protocol given', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          backendType: 'hive',
          version: '1.0.0',
          authProviders: ['entra'],
          mcpBaseUrl: 'https://hive.test.com',
        }),
      }));

      const conn = await manager.connectToHive('hive.test.com');
      expect(conn.baseUrl).toBe('https://hive.test.com');
    });

    it('throws on non-OK discovery response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }));

      await expect(manager.connectToHive('bad.server.com'))
        .rejects.toThrow(/returned 404/);
    });

    it('throws when server is not a hive backend', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          backendType: 'cloud',
          version: '1.0.0',
          authProviders: ['entra'],
          mcpBaseUrl: 'https://cloud.example.com',
        }),
      }));

      await expect(manager.connectToHive('cloud.example.com'))
        .rejects.toThrow(/did not identify as a Hive Server/);
    });

    it('throws when no auth providers configured', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          backendType: 'hive',
          version: '1.0.0',
          authProviders: [],
          mcpBaseUrl: 'https://hive.example.com',
        }),
      }));

      await expect(manager.connectToHive('hive.example.com'))
        .rejects.toThrow(/no supported authentication providers/);
    });

    it('throws on invalid URL', async () => {
      await expect(manager.connectToHive('not a valid url!!!'))
        .rejects.toThrow(/Invalid URL/);
    });

    it('rejects non-HTTPS URLs for remote hosts', async () => {
      await expect(manager.connectToHive('http://hive.company.com'))
        .rejects.toThrow(/must use HTTPS/);
    });

    it('allows HTTP for localhost', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          backendType: 'hive',
          version: '1.0.0',
          authProviders: ['entra'],
          mcpBaseUrl: 'http://localhost:8080',
        }),
      }));

      const conn = await manager.connectToHive('http://localhost:8080');
      expect(conn.baseUrl).toBe('http://localhost:8080');
    });

    it('filters auth providers to supported set', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          backendType: 'hive',
          version: '1.0.0',
          authProviders: ['entra', 'github', 'saml'],
          mcpBaseUrl: 'https://hive.example.com',
        }),
      }));

      const conn = await manager.connectToHive('hive.example.com');
      expect(conn.authProviders).toEqual(['entra']);
    });

    it('throws when no supported auth providers after filtering', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          backendType: 'hive',
          version: '1.0.0',
          authProviders: ['github', 'saml'],
          mcpBaseUrl: 'https://hive.example.com',
        }),
      }));

      await expect(manager.connectToHive('hive.example.com'))
        .rejects.toThrow(/no supported authentication providers/);
    });

    it('fires onConnectionChanged event', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          backendType: 'hive',
          version: '1.0.0',
          authProviders: ['entra'],
          mcpBaseUrl: 'https://hive.example.com',
        }),
      }));

      const listener = vi.fn();
      manager.onConnectionChanged(listener);

      await manager.connectToHive('hive.example.com');

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].backendType).toBe('hive');
    });
  });

  describe('connectToCloud', () => {
    it('clears stored connection and returns cloud default', async () => {
      globalState._store.set('aiqbee-connection', { backendType: 'hive' });

      const conn = await manager.connectToCloud();

      expect(conn.backendType).toBe('cloud');
      expect(globalState.update).toHaveBeenCalledWith('aiqbee-connection', undefined);
    });

    it('fires onConnectionChanged event', async () => {
      const listener = vi.fn();
      manager.onConnectionChanged(listener);

      await manager.connectToCloud();

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].backendType).toBe('cloud');
    });
  });

  describe('disconnect', () => {
    it('clears stored connection and cache', async () => {
      globalState._store.set('aiqbee-connection', { backendType: 'hive' });

      await manager.disconnect();

      expect(globalState.update).toHaveBeenCalledWith('aiqbee-connection', undefined);
      // After disconnect, getConnection returns cloud default
      expect(manager.getConnection().backendType).toBe('cloud');
    });
  });

  describe('isHive', () => {
    it('returns false for cloud connection', () => {
      expect(manager.isHive()).toBe(false);
    });

    it('returns true for hive connection', () => {
      globalState._store.set('aiqbee-connection', {
        backendType: 'hive',
        baseUrl: 'https://hive.test.com',
        mcpBaseUrl: 'https://hive.test.com',
        authProviders: ['entra'],
        label: 'hive.test.com',
      });

      // New manager to avoid cache from previous getConnection calls
      const mgr2 = new ConnectionManager(globalState as any);
      expect(mgr2.isHive()).toBe(true);
      mgr2.dispose();
    });
  });

  describe('cloud URL derivation', () => {
    it('derives mcp URL from api URL via subdomain swap', () => {
      process.env.VITE_API_URL = 'https://api.aiqbee.dev';
      const mgr = new ConnectionManager(globalState as any);

      const conn = mgr.getConnection();
      expect(conn.mcpBaseUrl).toBe('https://mcp.aiqbee.dev');
      mgr.dispose();
    });
  });
});
