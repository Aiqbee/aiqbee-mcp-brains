import * as vscode from 'vscode';
import { TokenStorage } from '../auth/token-storage.js';

const log = vscode.window.createOutputChannel('Aiqbee API');

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;
  private onRefreshToken: (() => Promise<boolean>) | null = null;

  constructor(private readonly tokenStorage: TokenStorage) {}

  get baseUrl(): string {
    // Injected at build time by esbuild from .env.eudev / .env.euprod
    return process.env.VITE_API_URL || 'https://api.aiqbee.com';
  }

  setRefreshHandler(handler: () => Promise<boolean>): void {
    this.onRefreshToken = handler;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /** POST with a specific Bearer token — for token exchange (e.g., MS → Aiqbee) */
  async postWithAuth<T>(path: string, body: unknown, bearerToken: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ApiRequestError(
        `Request failed: ${response.status} ${response.statusText}`,
        response.status,
        text,
      );
    }

    return response.json() as Promise<T>;
  }

  /** POST without auth header — for login/register endpoints */
  async postPublic<T>(path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ApiRequestError(
        `Request failed: ${response.status} ${response.statusText}`,
        response.status,
        text,
      );
    }

    return response.json() as Promise<T>;
  }

  private async request<T>(path: string, init: RequestInit, isRetry = false): Promise<T> {
    const token = await this.tokenStorage.getAccessToken();
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    log.appendLine(`${init.method} ${path}${isRetry ? ' (retry)' : ''}`);

    const response = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(180_000),
    });

    log.appendLine(`  → ${response.status} ${response.statusText} [${response.headers.get('content-type') ?? 'no content-type'}]`);

    if (response.status === 401 && !isRetry && this.onRefreshToken) {
      log.appendLine('  → 401 — attempting token refresh');
      const refreshed = await this.deduplicatedRefresh();
      if (refreshed) {
        return this.request<T>(path, init, true);
      }
      throw new ApiRequestError('Authentication expired. Please sign in again.', 401);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      log.appendLine(`  → ERROR body: [${text.length} bytes]`);
      throw new ApiRequestError(
        `Request failed: ${response.status} ${response.statusText}`,
        response.status,
        text,
      );
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const json = await response.json();
      log.appendLine(`  → JSON keys: ${typeof json === 'object' && json ? Object.keys(json).join(', ') : typeof json}${Array.isArray(json) ? ` (array[${json.length}])` : ''}`);
      return json as T;
    }

    log.appendLine('  → no JSON content');
    return undefined as unknown as T;
  }

  private async deduplicatedRefresh(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.onRefreshToken!().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }
}
