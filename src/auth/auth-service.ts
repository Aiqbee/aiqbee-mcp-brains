import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';
import { TokenStorage } from './token-storage.js';
import { ApiClient } from '../api/api-client.js';
import type { ConnectionManager } from '../connection/connection.js';
import type { AuthResponseDto, AuthState, UserDto, EmailSignInDto, EmailRegisterDto } from '../api/types.js';

interface EnvConfig {
  apiUrl: string;
  msalClientId: string;
  entraScopes: string;
  googleClientId: string;
}

function getEnvConfig(): EnvConfig {
  // Values injected at build time by esbuild from .env.eudev / .env.euprod
  return {
    apiUrl: process.env.VITE_API_URL || 'https://api.aiqbee.com',
    msalClientId: process.env.VITE_MSAL_CLIENT_ID || '',
    entraScopes: process.env.VITE_ENTRA_SCOPES || '',
    googleClientId: process.env.VITE_GOOGLE_CLIENT_ID || '',
  };
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

const LOOPBACK_HOST = '127.0.0.1';
const SUCCESS_HTML = '<html><body><h3>Sign-in successful!</h3><p>You can close this tab and return to VS Code.</p><script>window.close()</script></body></html>';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Start a temporary localhost HTTP server that listens for a single callback
 * on the given path. The `extractResult` function parses the query parameters
 * and returns either a resolved value or throws to reject.
 */
function startCallbackServer<T>(
  redirectPath: string,
  extractResult: (params: URLSearchParams) => T,
  timeoutMessage: string,
): Promise<{ port: number; resultPromise: Promise<T>; cancel: () => void }> {
  return new Promise((resolveSetup) => {
    let resolveResult: (value: T) => void;
    let rejectResult: (err: Error) => void;
    let settled = false;
    const resultPromise = new Promise<T>((res, rej) => {
      resolveResult = res;
      rejectResult = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);
      if (url.pathname === redirectPath) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        try {
          const result = extractResult(url.searchParams);
          res.end(SUCCESS_HTML);
          if (!settled) { settled = true; resolveResult(result); }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.end(`<html><body><h3>Sign-in failed</h3><p>${escapeHtml(message)}</p></body></html>`);
          if (!settled) { settled = true; rejectResult(err instanceof Error ? err : new Error(message)); }
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const cancel = () => {
      server.close();
      if (!settled) { settled = true; rejectResult(new Error('Sign-in cancelled')); }
    };

    server.listen(0, LOOPBACK_HOST, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolveSetup({ port, resultPromise, cancel });
    });

    // Auto-close after 5 minutes
    setTimeout(() => {
      server.close();
      if (!settled) { settled = true; rejectResult(new Error(timeoutMessage)); }
    }, 300_000);
  });
}

/** Start a localhost server to capture an OAuth authorization code */
function startCodeServer(redirectPath: string, expectedState: string) {
  return startCallbackServer<string>(
    redirectPath,
    (params) => {
      const state = params.get('state');
      if (state !== expectedState) {
        throw new Error('OAuth state mismatch — possible CSRF attack');
      }
      const code = params.get('code');
      if (code) {
        return code;
      }
      const errorDesc = params.get('error_description');
      const error = params.get('error');
      throw new Error(errorDesc || error || 'OAuth failed');
    },
    'OAuth timed out',
  );
}

interface HiveTokenResult {
  token: string;
  refreshToken: string;
  user: string;
}

/** Start a localhost server to capture hive-server brokered auth tokens */
function startHiveTokenServer(expectedState: string) {
  return startCallbackServer<HiveTokenResult>(
    '/oauth/callback',
    (params) => {
      const state = params.get('state');
      if (state !== expectedState) {
        throw new Error('OAuth state mismatch — possible CSRF attack');
      }
      const token = params.get('token');
      if (token) {
        return {
          token,
          refreshToken: params.get('refresh_token') || '',
          user: params.get('user') || '',
        };
      }
      throw new Error(params.get('error') || 'No token received from Hive Server');
    },
    'Hive Server authentication timed out',
  );
}

export class AuthStateError extends Error {
  constructor(
    message: string,
    public readonly state: AuthState,
  ) {
    super(message);
    this.name = 'AuthStateError';
  }
}

export class AuthService {
  private _onAuthStateChanged = new vscode.EventEmitter<{ authenticated: boolean; user?: UserDto; environment?: string }>();
  readonly onAuthStateChanged = this._onAuthStateChanged.event;
  private pendingCancel: (() => void) | null = null;

  constructor(
    private readonly tokenStorage: TokenStorage,
    private readonly apiClient: ApiClient,
    private readonly connectionManager: ConnectionManager,
  ) {}

  /** Cancel any in-progress sign-in flow (closes the callback server). */
  cancelSignIn(): void {
    if (this.pendingCancel) {
      this.pendingCancel();
      this.pendingCancel = null;
    }
  }

  getEnvironment(): string {
    const config = vscode.workspace.getConfiguration('aiqbee');
    return config.get<string>('environment', 'production');
  }

  async initialize(): Promise<{ authenticated: boolean; user?: UserDto; environment?: string }> {
    const environment = this.getEnvironment();
    const hasTokens = await this.tokenStorage.hasTokens();
    if (!hasTokens) {
      return { authenticated: false, environment };
    }

    try {
      const userJson = await this.tokenStorage.getUserJson();
      if (userJson) {
        const user = JSON.parse(userJson) as UserDto;
        return { authenticated: true, user, environment };
      }
      return { authenticated: true, environment };
    } catch {
      return { authenticated: true, environment };
    }
  }

  async signInWithMicrosoft(): Promise<void> {
    if (this.connectionManager.isHive()) {
      return this.signInViaHiveServer('entra');
    }

    const envConfig = getEnvConfig();
    const pkce = generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    // Start localhost redirect server
    const { port, resultPromise: codePromise, cancel } = await startCodeServer('/oauth/callback', state);
    this.pendingCancel = cancel;
    const redirectUri = `http://${LOOPBACK_HOST}:${port}/oauth/callback`;

    try {
      // Build Entra authorization URL
      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      authUrl.searchParams.set('client_id', envConfig.msalClientId);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', `openid profile email offline_access ${envConfig.entraScopes}`);
      authUrl.searchParams.set('response_mode', 'query');
      authUrl.searchParams.set('code_challenge', pkce.challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('prompt', 'select_account');

      // Open browser
      await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

      // Wait for the authorization code
      const code = await codePromise;

      // Exchange code for tokens
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: envConfig.msalClientId,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: pkce.verifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${errText}`);
      }

      const tokens = await tokenResponse.json() as {
        access_token: string;
        refresh_token?: string;
        id_token?: string;
      };

      if (!tokens.access_token) {
        throw new Error('No access token received from Microsoft');
      }

      // Exchange MS token for Aiqbee session — send as Bearer header (brain builder pattern)
      const aiqbeeResponse = await this.apiClient.postWithAuth<AuthResponseDto>(
        '/api/accounts/signin',
        {},
        tokens.access_token,
      );

      // Store the Aiqbee tokens (or the MS token if Aiqbee returns the same)
      const accessToken = aiqbeeResponse.accessToken || tokens.access_token;
      const refreshToken = aiqbeeResponse.refreshToken || tokens.refresh_token;

      await this.tokenStorage.setAccessToken(accessToken);
      if (refreshToken) {
        await this.tokenStorage.setRefreshToken(refreshToken);
      }
      await this.tokenStorage.setAuthType('microsoft');

      if (aiqbeeResponse.user) {
        await this.tokenStorage.setUserJson(JSON.stringify(aiqbeeResponse.user));
      }

      this._onAuthStateChanged.fire({
        authenticated: true,
        user: aiqbeeResponse.user,
        environment: this.getEnvironment(),
      });
    } finally {
      this.pendingCancel = null;
      cancel();
    }
  }

  async signInWithGoogle(): Promise<void> {
    if (this.connectionManager.isHive()) {
      return this.signInViaHiveServer('google');
    }

    const envConfig = getEnvConfig();

    const redirectUri = await vscode.env.asExternalUri(
      vscode.Uri.parse('vscode://aiqbee.aiqbee-brain-manager/oauth/callback')
    );

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', envConfig.googleClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri.toString());
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', 'openid email profile');

    await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
  }

  async handleGoogleCallback(accessToken: string): Promise<void> {
    const response = await this.apiClient.postPublic<AuthResponseDto>('/api/auth/google', {
      accessToken,
    });
    await this.handleAuthResponse(response, 'google');
  }

  async signInWithEmail(dto: EmailSignInDto): Promise<void> {
    const response = await this.apiClient.postPublic<AuthResponseDto>('/api/auth/email/login', dto);
    await this.handleAuthResponse(response, 'email');
  }

  async register(dto: EmailRegisterDto): Promise<{ emailVerificationRequired: boolean }> {
    const response = await this.apiClient.postPublic<AuthResponseDto>('/api/auth/email/register', dto);

    // After email registration the backend requires email verification
    // before the user can sign in. The response may not contain tokens.
    if (!response.accessToken) {
      // Registration succeeded but email verification is needed
      return { emailVerificationRequired: true };
    }

    // If the backend does return tokens (unlikely for email reg), log in
    await this.handleAuthResponse(response, 'email');
    return { emailVerificationRequired: false };
  }

  async signOut(): Promise<void> {
    await this.tokenStorage.clear();
    this._onAuthStateChanged.fire({ authenticated: false, environment: this.getEnvironment() });
  }

  async refreshToken(): Promise<boolean> {
    const refreshToken = await this.tokenStorage.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      // Hive Server: refresh via hive-server's own endpoint
      if (this.connectionManager.isHive()) {
        const response = await this.apiClient.postPublic<{ accessToken: string; refreshToken: string }>(
          '/api/vscode/auth/refresh',
          { refreshToken },
        );
        if (response.accessToken) {
          await this.tokenStorage.setAccessToken(response.accessToken);
          if (response.refreshToken) {
            await this.tokenStorage.setRefreshToken(response.refreshToken);
          }
          return true;
        }
        return false;
      }

      // Cloud: existing refresh logic
      const authType = await this.tokenStorage.getAuthType();

      if (authType === 'microsoft') {
        // For Microsoft, refresh via the MS token endpoint
        const envConfig = getEnvConfig();
        const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: envConfig.msalClientId,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: `openid profile email offline_access ${envConfig.entraScopes}`,
          }).toString(),
        });

        if (tokenResponse.ok) {
          const tokens = await tokenResponse.json() as {
            access_token: string;
            refresh_token?: string;
          };
          await this.tokenStorage.setAccessToken(tokens.access_token);
          if (tokens.refresh_token) {
            await this.tokenStorage.setRefreshToken(tokens.refresh_token);
          }
          return true;
        }
        return false;
      }

      // Email/Google refresh via Aiqbee API
      const response = await this.apiClient.postPublic<AuthResponseDto>('/api/auth/refresh', {
        refreshToken,
      });

      if (response.accessToken) {
        await this.tokenStorage.setAccessToken(response.accessToken);
        if (response.refreshToken) {
          await this.tokenStorage.setRefreshToken(response.refreshToken);
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Brokered auth via Hive Server. Opens the hive-server's login page in the
   * browser, which handles OAuth and redirects back to localhost with JWT tokens.
   */
  private async signInViaHiveServer(provider: 'entra' | 'google'): Promise<void> {
    const conn = this.connectionManager.getConnection();
    const state = crypto.randomBytes(16).toString('hex');
    const { port, resultPromise: tokenPromise, cancel } = await startHiveTokenServer(state);
    this.pendingCancel = cancel;

    try {
      const loginUrl = new URL('/api/vscode/auth/login', conn.baseUrl);
      loginUrl.searchParams.set('redirect_port', String(port));
      loginUrl.searchParams.set('provider', provider);
      loginUrl.searchParams.set('state', state);
      await vscode.env.openExternal(vscode.Uri.parse(loginUrl.toString()));

      const result = await tokenPromise;

      await this.tokenStorage.setAccessToken(result.token);
      if (result.refreshToken) {
        await this.tokenStorage.setRefreshToken(result.refreshToken);
      }
      await this.tokenStorage.setAuthType(provider === 'entra' ? 'microsoft' : 'google');

      let user: UserDto | undefined;
      if (result.user) {
        try {
          user = JSON.parse(result.user) as UserDto;
          await this.tokenStorage.setUserJson(result.user);
        } catch {
          // User JSON parsing failed — not critical
        }
      }

      this._onAuthStateChanged.fire({
        authenticated: true,
        user,
        environment: this.getEnvironment(),
      });
    } finally {
      this.pendingCancel = null;
      cancel();
    }
  }

  private async handleAuthResponse(
    response: AuthResponseDto,
    authType: 'microsoft' | 'google' | 'email',
  ): Promise<void> {
    if (response.state !== 'Active') {
      if (response.state === 'SignUpRequired') {
        throw new AuthStateError(
          'No account found. Please sign up at the Aiqbee web app first, then return here to sign in.',
          'SignUpRequired',
        );
      }
      if (response.state === 'PendingApproval') {
        throw new AuthStateError(
          'Your account is pending approval by your organisation administrator.',
          'PendingApproval',
        );
      }
      throw new AuthStateError(
        response.message || `Authentication failed: ${response.state}`,
        response.state,
      );
    }

    if (!response.accessToken) {
      throw new Error('No access token received');
    }

    await this.tokenStorage.setAccessToken(response.accessToken);
    if (response.refreshToken) {
      await this.tokenStorage.setRefreshToken(response.refreshToken);
    }
    await this.tokenStorage.setAuthType(authType);

    if (response.user) {
      await this.tokenStorage.setUserJson(JSON.stringify(response.user));
    }

    this._onAuthStateChanged.fire({
      authenticated: true,
      user: response.user,
      environment: this.getEnvironment(),
    });
  }

  dispose(): void {
    this._onAuthStateChanged.dispose();
  }
}
