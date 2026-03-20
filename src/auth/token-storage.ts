import * as vscode from 'vscode';

const KEYS = {
  accessToken: 'aiqbee-access-token',
  refreshToken: 'aiqbee-refresh-token',
  authType: 'aiqbee-auth-type',
  userJson: 'aiqbee-user-json',
} as const;

export type AuthType = 'microsoft' | 'google' | 'email';

export class TokenStorage {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getAccessToken(): Promise<string | undefined> {
    return this.secrets.get(KEYS.accessToken);
  }

  async setAccessToken(token: string): Promise<void> {
    await this.secrets.store(KEYS.accessToken, token);
  }

  async getRefreshToken(): Promise<string | undefined> {
    return this.secrets.get(KEYS.refreshToken);
  }

  async setRefreshToken(token: string): Promise<void> {
    await this.secrets.store(KEYS.refreshToken, token);
  }

  async getAuthType(): Promise<AuthType | undefined> {
    const value = await this.secrets.get(KEYS.authType);
    return value as AuthType | undefined;
  }

  async setAuthType(type: AuthType): Promise<void> {
    await this.secrets.store(KEYS.authType, type);
  }

  async getUserJson(): Promise<string | undefined> {
    return this.secrets.get(KEYS.userJson);
  }

  async setUserJson(json: string): Promise<void> {
    await this.secrets.store(KEYS.userJson, json);
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.secrets.delete(KEYS.accessToken),
      this.secrets.delete(KEYS.refreshToken),
      this.secrets.delete(KEYS.authType),
      this.secrets.delete(KEYS.userJson),
    ]);
  }

  async hasTokens(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== undefined && token.length > 0;
  }
}
