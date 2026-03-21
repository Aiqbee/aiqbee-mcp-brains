import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiClient, ApiRequestError } from './api-client.js';
import { TokenStorage } from '../auth/token-storage.js';

function createMockTokenStorage(token?: string): TokenStorage {
  return {
    getAccessToken: vi.fn().mockResolvedValue(token),
    setAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    setRefreshToken: vi.fn(),
    getAuthType: vi.fn(),
    setAuthType: vi.fn(),
    getUserJson: vi.fn(),
    setUserJson: vi.fn(),
    clear: vi.fn(),
    hasTokens: vi.fn().mockResolvedValue(!!token),
  } as unknown as TokenStorage;
}

function mockFetch(response: Partial<Response>) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({}),
    text: async () => '',
    ...response,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('ApiClient', () => {
  let tokenStorage: TokenStorage;
  let client: ApiClient;

  beforeEach(() => {
    tokenStorage = createMockTokenStorage('test-token');
    client = new ApiClient(tokenStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('GET requests', () => {
    it('sends GET with auth header', async () => {
      const fetchMock = mockFetch({
        json: async () => ({ id: '1' }),
      });

      const result = await client.get('/api/test');

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/api/test');
      expect(init.method).toBe('GET');
      expect(init.headers.Authorization).toBe('Bearer test-token');
      expect(result).toEqual({ id: '1' });
    });

    it('sends GET without auth when no token', async () => {
      tokenStorage = createMockTokenStorage(undefined);
      client = new ApiClient(tokenStorage);

      const fetchMock = mockFetch({
        json: async () => ({}),
      });

      await client.get('/api/test');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    });
  });

  describe('POST requests', () => {
    it('sends POST with JSON body', async () => {
      const fetchMock = mockFetch({
        json: async () => ({ created: true }),
      });

      const result = await client.post('/api/items', { name: 'test' });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ name: 'test' });
      expect(result).toEqual({ created: true });
    });
  });

  describe('PUT requests', () => {
    it('sends PUT with JSON body', async () => {
      const fetchMock = mockFetch({
        json: async () => ({ updated: true }),
      });

      await client.put('/api/items/1', { name: 'updated' });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body)).toEqual({ name: 'updated' });
    });
  });

  describe('error handling', () => {
    it('throws ApiRequestError on non-OK response', async () => {
      mockFetch({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'not found',
      });

      await expect(client.get('/api/missing'))
        .rejects
        .toThrow(ApiRequestError);
    });

    it('includes status code in error', async () => {
      mockFetch({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'server error',
      });

      try {
        await client.get('/api/broken');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        expect((err as ApiRequestError).status).toBe(500);
      }
    });
  });

  describe('401 token refresh', () => {
    it('retries request after successful refresh', async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: new Headers(),
            text: async () => 'unauthorized',
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ retried: true }),
        };
      });
      vi.stubGlobal('fetch', fetchMock);

      const refreshHandler = vi.fn().mockResolvedValue(true);
      client.setRefreshHandler(refreshHandler);

      const result = await client.get('/api/protected');

      expect(refreshHandler).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ retried: true });
    });

    it('throws when refresh fails', async () => {
      mockFetch({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => '',
      });

      client.setRefreshHandler(vi.fn().mockResolvedValue(false));

      await expect(client.get('/api/protected'))
        .rejects
        .toThrow('Authentication expired');
    });

    it('deduplicates concurrent refresh calls', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return {
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: new Headers(),
            text: async () => '',
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ok: true }),
        };
      }));

      const refreshHandler = vi.fn().mockResolvedValue(true);
      client.setRefreshHandler(refreshHandler);

      // Fire two requests concurrently — should only refresh once
      await Promise.all([
        client.get('/api/a'),
        client.get('/api/b'),
      ]);

      expect(refreshHandler).toHaveBeenCalledOnce();
    });
  });

  describe('postPublic', () => {
    it('sends request without auth header', async () => {
      const fetchMock = mockFetch({
        json: async () => ({ state: 'Active', accessToken: 'new-tok' }),
      });

      await client.postPublic('/api/auth/login', { email: 'a@b.com', password: 'pw' });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    });
  });

  describe('postWithAuth', () => {
    it('uses provided bearer token', async () => {
      const fetchMock = mockFetch({
        json: async () => ({ accessToken: 'aiqbee-tok' }),
      });

      await client.postWithAuth('/api/accounts/signin', {}, 'ms-token-xyz');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer ms-token-xyz');
    });
  });
});
