import * as vscode from 'vscode';
import type { ConnectionManager, ServerEntry } from './connection.js';
import { ServerSession } from './server-session.js';
import { TokenStorage } from '../auth/token-storage.js';

const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Keeps one ServerSession per configured server, creating and disposing them
 * as the registry changes, and refreshes every signed-in session on a timer.
 */
export class SessionManager {
  private readonly sessions = new Map<string, ServerSession>();
  private readonly sessionListeners = new Map<string, vscode.Disposable>();
  private readonly disposables: vscode.Disposable[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private refreshing = false;

  private readonly _onDidChange = new vscode.EventEmitter<ServerSession | undefined>();
  /** Fires with a session when its state changes, or undefined when sessions are added or removed. */
  readonly onDidChange = this._onDidChange.event;

  private readonly _onDidRemoveSession = new vscode.EventEmitter<ServerEntry>();
  /** Fires after a server has been removed and its stored session deleted. */
  readonly onDidRemoveSession = this._onDidRemoveSession.event;

  constructor(
    private readonly registry: ConnectionManager,
    private readonly secrets: vscode.SecretStorage,
  ) {
    this.disposables.push(
      registry.onDidChangeServers(() => { void this.sync(); }),
      registry.onDidRemoveServer((entry) => { void this.handleRemoved(entry); }),
    );
  }

  /** Create a session for every configured server and read their stored sign-ins. */
  async initialize(): Promise<void> {
    await this.sync();
  }

  all(): ServerSession[] {
    return this.registry.list()
      .map((entry) => this.sessions.get(entry.id))
      .filter((s): s is ServerSession => s !== undefined);
  }

  get(serverId: string): ServerSession | undefined {
    return this.sessions.get(serverId);
  }

  require(serverId: string): ServerSession {
    const session = this.sessions.get(serverId);
    if (!session) {
      throw new Error('That server is no longer configured.');
    }
    return session;
  }

  startRefreshTimer(intervalMs = DEFAULT_REFRESH_INTERVAL_MS): void {
    this.stopRefreshTimer();
    this.timer = setInterval(() => { void this.refreshAll(); }, intervalMs);
  }

  stopRefreshTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Refresh each signed-in session's token independently; one failure never stops the others. */
  async refreshAll(): Promise<void> {
    if (this.refreshing) {
      return;
    }
    this.refreshing = true;
    try {
      await Promise.allSettled(this.all().map((s) => s.refreshToken()));
    } finally {
      this.refreshing = false;
    }
  }

  dispose(): void {
    this.stopRefreshTimer();
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
    this.sessionListeners.forEach((d) => d.dispose());
    this.sessionListeners.clear();
    this.disposables.forEach((d) => d.dispose());
    this._onDidChange.dispose();
    this._onDidRemoveSession.dispose();
  }

  private async sync(): Promise<void> {
    const ids = new Set(this.registry.list().map((s) => s.id));
    const added: ServerSession[] = [];

    for (const entry of this.registry.list()) {
      if (!this.sessions.has(entry.id)) {
        const session = new ServerSession(this.registry, entry.id, this.secrets);
        this.sessions.set(entry.id, session);
        this.sessionListeners.set(entry.id, session.onDidChange((s) => this._onDidChange.fire(s)));
        added.push(session);
      }
    }

    for (const id of [...this.sessions.keys()]) {
      if (!ids.has(id)) {
        this.disposeSession(id);
      }
    }

    await Promise.allSettled(added.map((s) => s.initialize()));
    // Fire even when nothing was added or removed: a rename or rediscovery changes labels.
    this._onDidChange.fire(undefined);
  }

  /**
   * Delete a removed server's stored session. The registry fires its change
   * event (which disposes the session in sync) before the removal event, so
   * the secret is cleared through a fresh storage handle.
   */
  private async handleRemoved(entry: ServerEntry): Promise<void> {
    this.disposeSession(entry.id);
    await new TokenStorage(this.secrets, entry.id).clear().catch(() => undefined);
    this._onDidRemoveSession.fire(entry);
  }

  private disposeSession(id: string): void {
    this.sessions.get(id)?.dispose();
    this.sessions.delete(id);
    this.sessionListeners.get(id)?.dispose();
    this.sessionListeners.delete(id);
  }
}
