import * as vscode from 'vscode';
import type { TokenStorage } from '../auth/token-storage.js';

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

/** The server could not be reached (DNS, connection refused, timeout). Tokens are kept. */
export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Outcome of a token refresh.
 * - ok: new tokens stored
 * - rejected: the server refused the refresh token; the session is over
 * - unreachable: the server could not be reached or failed; try again later
 */
export type RefreshResult = 'ok' | 'rejected' | 'unreachable';

/** HTTP client for one server, with Bearer auth and a single de-duplicated refresh on 401. */
export class ApiClient {
  private refreshPromise: Promise<RefreshResult> | null = null;
  private onRefreshToken: (() => Promise<RefreshResult>) | null = null;

  constructor(
    readonly baseUrl: string,
    private readonly tokenStorage: TokenStorage,
  ) {}

  setRefreshHandler(handler: () => Promise<RefreshResult>): void {
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
    const response = await this.send(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(body),
    }, 30_000);
    return this.parseOrThrow<T>(response);
  }

  /** POST without auth header — for login/register/refresh endpoints */
  async postPublic<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.send(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }, 30_000);
    return this.parseOrThrow<T>(response);
  }

  private async request<T>(path: string, init: RequestInit, isRetry = false): Promise<T> {
    const token = await this.tokenStorage.getAccessToken();
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    log.appendLine(`${init.method} ${this.baseUrl}${path}${isRetry ? ' (retry)' : ''}`);
    const response = await this.send(path, { ...init, headers }, 180_000);
    log.appendLine(`  → ${response.status} ${response.statusText} [${response.headers.get('content-type') ?? 'no content-type'}]`);

    if (response.status === 401 && !isRetry && this.onRefreshToken) {
      log.appendLine('  → 401 — attempting token refresh');
      const result = await this.deduplicatedRefresh();
      if (result === 'ok') {
        return this.request<T>(path, init, true);
      }
      if (result === 'unreachable') {
        throw new NetworkError(`Could not refresh the session with ${this.baseUrl}.`);
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
      return (await response.json()) as T;
    }
    return undefined as unknown as T;
  }

  /** fetch() that turns connection failures and timeouts into NetworkError. */
  private async send(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      log.appendLine(`  → network error: ${err instanceof Error ? err.message : String(err)}`);
      throw new NetworkError(`Could not reach ${this.baseUrl}.`, err);
    }
  }

  private async parseOrThrow<T>(response: Response): Promise<T> {
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

  private async deduplicatedRefresh(): Promise<RefreshResult> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.onRefreshToken!().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }
}
