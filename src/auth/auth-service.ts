import * as vscode from 'vscode';
import { TokenStorage } from './token-storage.js';
import { ApiClient } from '../api/api-client.js';
import type { AuthResponseDto, UserDto, EmailSignInDto, EmailRegisterDto } from '../api/types.js';

export class AuthService {
  private _onAuthStateChanged = new vscode.EventEmitter<{ authenticated: boolean; user?: UserDto }>();
  readonly onAuthStateChanged = this._onAuthStateChanged.event;

  constructor(
    private readonly tokenStorage: TokenStorage,
    private readonly apiClient: ApiClient,
  ) {}

  async initialize(): Promise<{ authenticated: boolean; user?: UserDto }> {
    const hasTokens = await this.tokenStorage.hasTokens();
    if (!hasTokens) {
      return { authenticated: false };
    }

    try {
      const userJson = await this.tokenStorage.getUserJson();
      if (userJson) {
        const user = JSON.parse(userJson) as UserDto;
        return { authenticated: true, user };
      }
      return { authenticated: true };
    } catch {
      return { authenticated: true };
    }
  }

  async signInWithMicrosoft(): Promise<void> {
    const config = vscode.workspace.getConfiguration('aiqbee');
    const env = config.get<string>('environment', 'production');
    const scopes = env === 'development'
      ? ['api://3f91729c-d752-498b-8b12-c2552c31d10e/user.access']
      : ['api://9935edc3-c4c8-4cff-b3d9-6089096a9579/user.access'];

    const session = await vscode.authentication.getSession('microsoft', scopes, { createIfNone: true });

    // Exchange Microsoft token for Aiqbee token
    const response = await this.apiClient.postPublic<AuthResponseDto>('/api/accounts/signin', {
      accessToken: session.accessToken,
      enableMcp: true,
    });

    await this.handleAuthResponse(response, 'microsoft');
  }

  async signInWithGoogle(): Promise<void> {
    // Google OAuth requires custom URI handler flow
    // Open browser for Google sign-in, capture redirect via URI handler
    const config = vscode.workspace.getConfiguration('aiqbee');
    const env = config.get<string>('environment', 'production');
    const clientId = env === 'development'
      ? '889180962551-mlb6f07k2au1l8he466u723v5lbqc442.apps.googleusercontent.com'
      : '889180962551-8ap19r95rthh7tj0khv4e5u3j44q561c.apps.googleusercontent.com';

    const redirectUri = await vscode.env.asExternalUri(
      vscode.Uri.parse('vscode://aiqbee.aiqbee-brain-manager/oauth/callback')
    );

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri.toString());
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', 'openid email profile');

    await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
    // Token capture handled by URI handler registered in extension.ts
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
    this._onAuthStateChanged.fire({ authenticated: false });
  }

  async refreshToken(): Promise<boolean> {
    const refreshToken = await this.tokenStorage.getRefreshToken();
    const authType = await this.tokenStorage.getAuthType();

    if (!refreshToken) {
      return false;
    }

    try {
      if (authType === 'microsoft') {
        // Microsoft tokens are refreshed via VS Code's built-in auth
        const config = vscode.workspace.getConfiguration('aiqbee');
        const env = config.get<string>('environment', 'production');
        const scopes = env === 'development'
          ? ['api://3f91729c-d752-498b-8b12-c2552c31d10e/user.access']
          : ['api://9935edc3-c4c8-4cff-b3d9-6089096a9579/user.access'];

        const session = await vscode.authentication.getSession('microsoft', scopes, { silent: true });
        if (session) {
          const response = await this.apiClient.postPublic<AuthResponseDto>('/api/accounts/signin', {
            accessToken: session.accessToken,
            enableMcp: true,
          });
          if (response.accessToken) {
            await this.tokenStorage.setAccessToken(response.accessToken);
            if (response.refreshToken) {
              await this.tokenStorage.setRefreshToken(response.refreshToken);
            }
            return true;
          }
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
    });
  }

  dispose(): void {
    this._onAuthStateChanged.dispose();
  }
}
