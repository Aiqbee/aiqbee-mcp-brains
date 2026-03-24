import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as http from 'http';
import { AuthService, AuthStateError } from './auth-service.js';
import { TokenStorage } from './token-storage.js';
import type { ConnectionManager, Connection } from '../connection/connection.js';
import type { ApiClient } from '../api/api-client.js';

// --- Mock helpers -------------------------------------------------------

function createMockTokenStorage(): TokenStorage {
  return {
    getAccessToken: vi.fn().mockResolvedValue(undefined),
    setAccessToken: vi.fn().mockResolvedValue(undefined),
    getRefreshToken: vi.fn().mockResolvedValue(undefined),
    setRefreshToken: vi.fn().mockResolvedValue(undefined),
    getAuthType: vi.fn().mockResolvedValue(undefined),
    setAuthType: vi.fn().mockResolvedValue(undefined),
    getUserJson: vi.fn().mockResolvedValue(undefined),
    setUserJson: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    hasTokens: vi.fn().mockResolvedValue(false),
  } as unknown as TokenStorage;
}

function createMockApiClient(): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    postPublic: vi.fn(),
    postWithAuth: vi.fn(),
    setRefreshHandler: vi.fn(),
  } as unknown as ApiClient;
}

function createMockConnectionManager(overrides?: Partial<Connection>): ConnectionManager {
  const conn: Connection = {
    backendType: 'cloud',
    baseUrl: 'https://api.aiqbee.com',
    mcpBaseUrl: 'https://mcp.aiqbee.com',
    authProviders: ['entra', 'google', 'email'],
    label: 'Aiqbee Cloud',
    ...overrides,
  };
  return {
    getConnection: vi.fn().mockReturnValue(conn),
    isHive: vi.fn().mockReturnValue(conn.backendType === 'hive'),
    connectToHive: vi.fn(),
    connectToCloud: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    onConnectionChanged: vi.fn(),
  } as unknown as ConnectionManager;
}

/**
 * Send a GET request to a localhost callback server and return the response status.
 * Uses the http module directly so it is never intercepted by global fetch mocks.
 */
async function hitCallbackServer(
  port: number,
  path: string,
  params: Record<string, string>,
): Promise<number> {
  const url = new URL(path, `http://localhost:${port}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Promise<number>((resolve, reject) => {
    http.get(url.toString(), (res) => {
      // Consume the response body so the socket closes cleanly
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on('error', reject);
  });
}

// --- Tests ---------------------------------------------------------------

describe('AuthService', () => {
  let tokenStorage: TokenStorage;
  let apiClient: ApiClient;
  let connectionManager: ConnectionManager;
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    tokenStorage = createMockTokenStorage();
    apiClient = createMockApiClient();
    connectionManager = createMockConnectionManager();
    authService = new AuthService(tokenStorage, apiClient, connectionManager);
  });

  afterEach(() => {
    authService.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('signInWithGoogle — brokered auth flow', () => {
    it('opens browser to /api/vscode/auth/login with provider=google for cloud', async () => {
      // Capture the URL opened by vscode.env.openExternal
      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      // Start signInWithGoogle — it will open browser and wait for callback
      const signInPromise = authService.signInWithGoogle();

      // Wait for the server to start and browser to open
      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      // Parse the URL that was opened
      const openedUri = openExternalSpy.mock.calls[0][0];
      const openedUrl = new URL(openedUri.path);

      expect(openedUrl.origin).toBe('https://api.aiqbee.com');
      expect(openedUrl.pathname).toBe('/api/vscode/auth/login');
      expect(openedUrl.searchParams.get('provider')).toBe('google');
      expect(openedUrl.searchParams.get('redirect_port')).toBeTruthy();
      expect(openedUrl.searchParams.get('state')).toBeTruthy();

      // Simulate the backend redirecting back to localhost with tokens
      const port = Number(openedUrl.searchParams.get('redirect_port'));
      const state = openedUrl.searchParams.get('state')!;
      await hitCallbackServer(port, '/oauth/callback', {
        token: 'jwt-access-token',
        refresh_token: 'jwt-refresh-token',
        user: JSON.stringify({ id: '1', givenName: 'Test', familyName: 'User', email: 'test@example.com' }),
        state,
      });

      await signInPromise;

      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('jwt-access-token');
      expect(tokenStorage.setRefreshToken).toHaveBeenCalledWith('jwt-refresh-token');
      expect(tokenStorage.setAuthType).toHaveBeenCalledWith('google');
      expect(tokenStorage.setUserJson).toHaveBeenCalled();
    });

    it('opens browser to hive URL when connected to hive', async () => {
      connectionManager = createMockConnectionManager({
        backendType: 'hive',
        baseUrl: 'https://hive.company.com',
      });
      authService = new AuthService(tokenStorage, apiClient, connectionManager);

      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const signInPromise = authService.signInWithGoogle();

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL(openExternalSpy.mock.calls[0][0].path);
      expect(openedUrl.origin).toBe('https://hive.company.com');
      expect(openedUrl.pathname).toBe('/api/vscode/auth/login');
      expect(openedUrl.searchParams.get('provider')).toBe('google');

      // Send tokens back to complete the flow
      const port = Number(openedUrl.searchParams.get('redirect_port'));
      const state = openedUrl.searchParams.get('state')!;
      await hitCallbackServer(port, '/oauth/callback', {
        token: 'hive-jwt',
        refresh_token: 'hive-refresh',
        state,
      });

      await signInPromise;

      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('hive-jwt');
      expect(tokenStorage.setAuthType).toHaveBeenCalledWith('google');
    });

    it('accepts accessToken/refreshToken param names (cloud backend convention)', async () => {
      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const signInPromise = authService.signInWithGoogle();

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL(openExternalSpy.mock.calls[0][0].path);
      const port = Number(openedUrl.searchParams.get('redirect_port'));
      const state = openedUrl.searchParams.get('state')!;

      // Use cloud-style param names (accessToken/refreshToken instead of token/refresh_token)
      await hitCallbackServer(port, '/oauth/callback', {
        accessToken: 'cloud-jwt',
        refreshToken: 'cloud-refresh',
        state,
      });

      await signInPromise;

      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('cloud-jwt');
      expect(tokenStorage.setRefreshToken).toHaveBeenCalledWith('cloud-refresh');
    });

    it('rejects on CSRF state mismatch', async () => {
      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const signInPromise = authService.signInWithGoogle();
      // Attach early handler to prevent Node unhandled-rejection warning
      signInPromise.catch(() => {});

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL(openExternalSpy.mock.calls[0][0].path);
      const port = Number(openedUrl.searchParams.get('redirect_port'));

      // Send a callback with a WRONG state value
      await hitCallbackServer(port, '/oauth/callback', {
        token: 'jwt-access-token',
        state: 'wrong-state-value',
      });

      await expect(signInPromise).rejects.toThrow('OAuth state mismatch');
    });

    it('rejects when no token is returned', async () => {
      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const signInPromise = authService.signInWithGoogle();
      // Attach early handler to prevent Node unhandled-rejection warning
      signInPromise.catch(() => {});

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL(openExternalSpy.mock.calls[0][0].path);
      const port = Number(openedUrl.searchParams.get('redirect_port'));
      const state = openedUrl.searchParams.get('state')!;

      // Send callback with state but no token
      await hitCallbackServer(port, '/oauth/callback', { state });

      await expect(signInPromise).rejects.toThrow('No token received');
    });

    it('throws AuthStateError(SignUpRequired) when backend returns error=account_not_found', async () => {
      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const signInPromise = authService.signInWithGoogle();
      signInPromise.catch(() => {});

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL(openExternalSpy.mock.calls[0][0].path);
      const port = Number(openedUrl.searchParams.get('redirect_port'));
      const state = openedUrl.searchParams.get('state')!;

      await hitCallbackServer(port, '/oauth/callback', {
        error: 'account_not_found',
        state,
      });

      await expect(signInPromise).rejects.toThrow(AuthStateError);
      await expect(signInPromise).rejects.toThrow('No account found');
    });

    it('throws AuthStateError(PendingApproval) when backend returns error=account_inactive', async () => {
      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const signInPromise = authService.signInWithGoogle();
      signInPromise.catch(() => {});

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL(openExternalSpy.mock.calls[0][0].path);
      const port = Number(openedUrl.searchParams.get('redirect_port'));
      const state = openedUrl.searchParams.get('state')!;

      await hitCallbackServer(port, '/oauth/callback', {
        error: 'account_inactive',
        state,
      });

      await expect(signInPromise).rejects.toThrow(AuthStateError);
      await expect(signInPromise).rejects.toThrow('pending approval');
    });

    it('throws AuthStateError(Disabled) when backend returns error=tenant_inactive', async () => {
      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const signInPromise = authService.signInWithGoogle();
      signInPromise.catch(() => {});

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL(openExternalSpy.mock.calls[0][0].path);
      const port = Number(openedUrl.searchParams.get('redirect_port'));
      const state = openedUrl.searchParams.get('state')!;

      await hitCallbackServer(port, '/oauth/callback', {
        error: 'tenant_inactive',
        state,
      });

      await expect(signInPromise).rejects.toThrow(AuthStateError);
      await expect(signInPromise).rejects.toThrow('organisation account is inactive');
    });
  });

  describe('signInWithMicrosoft — cloud uses direct Entra OAuth (regression)', () => {
    it('does NOT use brokered auth for cloud Microsoft', async () => {
      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      // Start sign-in — it will open browser to Entra (not /api/vscode/auth/login)
      const signInPromise = authService.signInWithMicrosoft();

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL(openExternalSpy.mock.calls[0][0].path);

      // Should go directly to Microsoft, NOT through brokered auth
      expect(openedUrl.hostname).toBe('login.microsoftonline.com');
      expect(openedUrl.pathname).toContain('/authorize');

      // Clean up — cancel the pending flow
      authService.cancelSignIn();
      await signInPromise.catch(() => {}); // ignore cancellation error
    });

    it('uses brokered auth for hive Microsoft', async () => {
      connectionManager = createMockConnectionManager({
        backendType: 'hive',
        baseUrl: 'https://hive.company.com',
      });
      authService = new AuthService(tokenStorage, apiClient, connectionManager);

      const vscode = await import('vscode');
      const openExternalSpy = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const signInPromise = authService.signInWithMicrosoft();

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL(openExternalSpy.mock.calls[0][0].path);

      // Should go through hive server's brokered auth
      expect(openedUrl.origin).toBe('https://hive.company.com');
      expect(openedUrl.pathname).toBe('/api/vscode/auth/login');
      expect(openedUrl.searchParams.get('provider')).toBe('entra');

      // Complete the flow
      const port = Number(openedUrl.searchParams.get('redirect_port'));
      const state = openedUrl.searchParams.get('state')!;
      await hitCallbackServer(port, '/oauth/callback', {
        token: 'hive-ms-jwt',
        refresh_token: 'hive-ms-refresh',
        state,
      });

      await signInPromise;

      expect(tokenStorage.setAuthType).toHaveBeenCalledWith('microsoft');
    });

    it('throws AuthStateError when Aiqbee backend returns SignUpRequired for Microsoft', async () => {
      const vscode = await import('vscode');
      vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      // Mock fetch for MS token endpoint only — let localhost requests through
      const originalFetch = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: any) => {
        if (url.includes('localhost')) {
          return originalFetch(url, init);
        }
        // MS token endpoint
        return Promise.resolve({
          ok: true,
          json: async () => ({
            access_token: 'ms-access-token',
            refresh_token: 'ms-refresh-token',
          }),
        });
      }));

      // Mock the Aiqbee backend returning SignUpRequired
      (apiClient.postWithAuth as any).mockResolvedValue({
        state: 'SignUpRequired',
        message: 'No account found.',
      });

      const signInPromise = authService.signInWithMicrosoft();
      signInPromise.catch(() => {});

      await vi.waitFor(() => {
        expect(vscode.env.openExternal).toHaveBeenCalledOnce();
      });

      // Parse port from the redirect_uri query param in the Entra auth URL
      const openedUrl = new URL((vscode.env.openExternal as any).mock.calls[0][0].path);
      const redirectUri = new URL(openedUrl.searchParams.get('redirect_uri')!);
      const port = Number(redirectUri.port);
      const state = openedUrl.searchParams.get('state')!;

      // Hit the localhost callback with a code (simulating Entra redirect)
      await hitCallbackServer(port, '/oauth/callback', { code: 'auth-code', state });

      await expect(signInPromise).rejects.toThrow(AuthStateError);
      await expect(signInPromise).rejects.toThrow('No account found');
      // Should NOT have stored any tokens
      expect(tokenStorage.setAccessToken).not.toHaveBeenCalled();
    });

    it('handles integer state=3 (Active) from /api/accounts/signin', async () => {
      const vscode = await import('vscode');
      vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const originalFetch = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: any) => {
        if (url.includes('localhost')) {
          return originalFetch(url, init);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            access_token: 'ms-access-token',
            refresh_token: 'ms-refresh-token',
          }),
        });
      }));

      // Backend returns integer enum: Active = 3
      (apiClient.postWithAuth as any).mockResolvedValue({
        state: 3,
        accessToken: 'aiqbee-jwt',
        refreshToken: 'aiqbee-refresh',
        user: { id: '1', givenName: 'Test', familyName: 'User', email: 'test@example.com' },
      });

      const signInPromise = authService.signInWithMicrosoft();

      await vi.waitFor(() => {
        expect(vscode.env.openExternal).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL((vscode.env.openExternal as any).mock.calls[0][0].path);
      const redirectUri = new URL(openedUrl.searchParams.get('redirect_uri')!);
      const port = Number(redirectUri.port);
      const state = openedUrl.searchParams.get('state')!;

      await hitCallbackServer(port, '/oauth/callback', { code: 'auth-code', state });

      await signInPromise;

      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('aiqbee-jwt');
      expect(tokenStorage.setRefreshToken).toHaveBeenCalledWith('aiqbee-refresh');
      expect(tokenStorage.setAuthType).toHaveBeenCalledWith('microsoft');
    });

    it('handles integer state=0 (SignUp) from /api/accounts/signin as SignUpRequired', async () => {
      const vscode = await import('vscode');
      vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const originalFetch = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: any) => {
        if (url.includes('localhost')) {
          return originalFetch(url, init);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            access_token: 'ms-access-token',
            refresh_token: 'ms-refresh-token',
          }),
        });
      }));

      // Backend returns integer enum: SignUp = 0
      (apiClient.postWithAuth as any).mockResolvedValue({
        state: 0,
      });

      const signInPromise = authService.signInWithMicrosoft();
      signInPromise.catch(() => {});

      await vi.waitFor(() => {
        expect(vscode.env.openExternal).toHaveBeenCalledOnce();
      });

      const openedUrl = new URL((vscode.env.openExternal as any).mock.calls[0][0].path);
      const redirectUri = new URL(openedUrl.searchParams.get('redirect_uri')!);
      const port = Number(redirectUri.port);
      const state = openedUrl.searchParams.get('state')!;

      await hitCallbackServer(port, '/oauth/callback', { code: 'auth-code', state });

      await expect(signInPromise).rejects.toThrow(AuthStateError);
      await expect(signInPromise).rejects.toThrow('No account found');
      expect(tokenStorage.setAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('uses /api/vscode/auth/refresh for cloud Google', async () => {
      (tokenStorage.getRefreshToken as any).mockResolvedValue('google-refresh-tok');
      (tokenStorage.getAuthType as any).mockResolvedValue('google');
      (apiClient.postPublic as any).mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const result = await authService.refreshToken();

      expect(result).toBe(true);
      expect(apiClient.postPublic).toHaveBeenCalledWith(
        '/api/vscode/auth/refresh',
        { refreshToken: 'google-refresh-tok' },
      );
      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('new-access');
      expect(tokenStorage.setRefreshToken).toHaveBeenCalledWith('new-refresh');
    });

    it('uses /api/auth/refresh for cloud email', async () => {
      (tokenStorage.getRefreshToken as any).mockResolvedValue('email-refresh-tok');
      (tokenStorage.getAuthType as any).mockResolvedValue('email');
      (apiClient.postPublic as any).mockResolvedValue({
        accessToken: 'new-email-access',
        refreshToken: 'new-email-refresh',
        state: 'Active',
      });

      const result = await authService.refreshToken();

      expect(result).toBe(true);
      expect(apiClient.postPublic).toHaveBeenCalledWith(
        '/api/auth/refresh',
        { refreshToken: 'email-refresh-tok' },
      );
    });

    it('uses /api/vscode/auth/refresh for hive (any auth type)', async () => {
      connectionManager = createMockConnectionManager({
        backendType: 'hive',
        baseUrl: 'https://hive.company.com',
      });
      authService = new AuthService(tokenStorage, apiClient, connectionManager);

      (tokenStorage.getRefreshToken as any).mockResolvedValue('hive-refresh-tok');
      (apiClient.postPublic as any).mockResolvedValue({
        accessToken: 'hive-new-access',
        refreshToken: 'hive-new-refresh',
      });

      const result = await authService.refreshToken();

      expect(result).toBe(true);
      expect(apiClient.postPublic).toHaveBeenCalledWith(
        '/api/vscode/auth/refresh',
        { refreshToken: 'hive-refresh-tok' },
      );
    });

    it('uses Microsoft token endpoint for cloud Microsoft', async () => {
      (tokenStorage.getRefreshToken as any).mockResolvedValue('ms-refresh-tok');
      (tokenStorage.getAuthType as any).mockResolvedValue('microsoft');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-ms-access',
          refresh_token: 'new-ms-refresh',
        }),
      }));

      const result = await authService.refreshToken();

      expect(result).toBe(true);
      // Should call Microsoft's token endpoint directly
      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][0]).toContain('login.microsoftonline.com');
      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('new-ms-access');
    });

    it('returns false when no refresh token stored', async () => {
      (tokenStorage.getRefreshToken as any).mockResolvedValue(undefined);

      const result = await authService.refreshToken();

      expect(result).toBe(false);
    });
  });

  describe('cancelSignIn', () => {
    it('cancels an in-progress Google sign-in', async () => {
      const vscode = await import('vscode');
      vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      const signInPromise = authService.signInWithGoogle();

      // Wait for server to start
      await vi.waitFor(() => {
        expect(vscode.env.openExternal).toHaveBeenCalledOnce();
      });

      // Cancel
      authService.cancelSignIn();

      await expect(signInPromise).rejects.toThrow('Sign-in cancelled');
    });
  });
});
