import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';
import { TokenStorage } from './token-storage.js';
import { ApiClient } from '../api/api-client.js';
import type { AuthResponseDto, UserDto, EmailSignInDto, EmailRegisterDto } from '../api/types.js';

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

/** Start a temporary localhost HTTP server to capture OAuth redirects */
function startRedirectServer(
  redirectPath: string,
): Promise<{ port: number; codePromise: Promise<string>; close: () => void }> {
  return new Promise((resolveSetup) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);
      if (url.pathname === redirectPath) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const errorDesc = url.searchParams.get('error_description');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (code) {
          res.end('<html><body><h3>Sign-in successful!</h3><p>You can close this tab and return to VS Code.</p><script>window.close()</script></body></html>');
          resolveCode(code);
        } else {
          res.end(`<html><body><h3>Sign-in failed</h3><p>${errorDesc || error || 'Unknown error'}</p></body></html>`);
          rejectCode(new Error(errorDesc || error || 'OAuth failed'));
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Listen on random available port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolveSetup({
        port,
        codePromise,
        close: () => server.close(),
      });
    });

    // Auto-close after 2 minutes
    setTimeout(() => {
      server.close();
      rejectCode(new Error('OAuth timed out'));
    }, 120_000);
  });
}

export class AuthService {
  private _onAuthStateChanged = new vscode.EventEmitter<{ authenticated: boolean; user?: UserDto; environment?: string }>();
  readonly onAuthStateChanged = this._onAuthStateChanged.event;

  constructor(
    private readonly tokenStorage: TokenStorage,
    private readonly apiClient: ApiClient,
  ) {}

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
    const envConfig = getEnvConfig();
    const pkce = generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    // Start localhost redirect server
    const { port, codePromise, close } = await startRedirectServer('/oauth/callback');
    const redirectUri = `http://localhost:${port}/oauth/callback`;

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
      close();
    }
  }

  async signInWithGoogle(): Promise<void> {
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

  async register(dto: EmailRegisterDto): Promise<void> {
    const response = await this.apiClient.postPublic<AuthResponseDto>('/api/auth/email/register', dto);
    await this.handleAuthResponse(response, 'email');
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

  private async handleAuthResponse(
    response: AuthResponseDto,
    authType: 'microsoft' | 'google' | 'email',
  ): Promise<void> {
    if (response.state !== 'Active') {
      if (response.state === 'SignUpRequired') {
        throw new Error('Account not found. Please create an account first.');
      }
      if (response.state === 'PendingApproval') {
        throw new Error('Your account is pending approval.');
      }
      throw new Error(response.message || `Authentication failed: ${response.state}`);
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
