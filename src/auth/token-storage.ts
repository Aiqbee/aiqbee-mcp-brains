import * as vscode from 'vscode';
import type { UserDto } from '../api/types.js';

export type AuthType = 'microsoft' | 'google' | 'email';

/** Everything stored for one server's sign-in, kept as a single secret so writes are atomic. */
export interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  authType?: AuthType;
  user?: UserDto;
}

/** SecretStorage key for a server's session blob. */
export function sessionSecretKey(serverId: string): string {
  return `aiqbee.server.${serverId}.session`;
}

/**
 * Token storage scoped to one server. Each server's session lives in its own
 * secret, so signing in or out of one server never touches another.
 */
export class TokenStorage {
  private readonly key: string;
  /** Serialises read-modify-write updates so concurrent refreshes cannot interleave. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly secrets: vscode.SecretStorage,
    readonly serverId: string,
  ) {
    this.key = sessionSecretKey(serverId);
  }

  /** The stored session, or undefined if signed out or the stored value is unreadable. */
  async getSession(): Promise<StoredSession | undefined> {
    const raw = await this.secrets.get(this.key);
    if (!raw) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as StoredSession;
      return typeof parsed?.accessToken === 'string' && parsed.accessToken.length > 0
        ? parsed
        : undefined;
    } catch {
      return undefined;
    }
  }

  /** Replace the whole session. */
  async setSession(session: StoredSession): Promise<void> {
    await this.enqueue(() => this.secrets.store(this.key, JSON.stringify(session)));
  }

  /**
   * Store refreshed tokens, keeping the auth type and user — but only if the
   * stored session is still the one that was refreshed. A refresh that
   * finishes after a sign-out or a new sign-in must not bring back or
   * overwrite that session. Returns false when the tokens were discarded.
   *
   * @param refreshedWith The refresh token the refresh was made with.
   */
  async updateTokens(accessToken: string, refreshToken: string | undefined, refreshedWith: string): Promise<boolean> {
    return this.enqueue(async () => {
      const current = await this.getSession();
      if (!current || current.refreshToken !== refreshedWith) {
        return false;
      }
      const next: StoredSession = {
        ...current,
        accessToken,
        refreshToken: refreshToken ?? current.refreshToken,
      };
      await this.secrets.store(this.key, JSON.stringify(next));
      return true;
    });
  }

  async getAccessToken(): Promise<string | undefined> {
    return (await this.getSession())?.accessToken;
  }

  async getRefreshToken(): Promise<string | undefined> {
    return (await this.getSession())?.refreshToken;
  }

  async getAuthType(): Promise<AuthType | undefined> {
    return (await this.getSession())?.authType;
  }

  async hasTokens(): Promise<boolean> {
    return (await this.getSession()) !== undefined;
  }

  async clear(): Promise<void> {
    await this.enqueue(() => this.secrets.delete(this.key));
  }

  private enqueue<T>(task: () => Thenable<T> | Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
