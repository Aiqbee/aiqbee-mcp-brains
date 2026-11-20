import * as vscode from 'vscode';
import { ApiClient, ApiRequestError, NetworkError } from '../api/api-client.js';
import { AuthService } from '../auth/auth-service.js';
import { TokenStorage } from '../auth/token-storage.js';
import { BrainService } from '../api/brain-service.js';
import { NeuronService } from '../api/neuron-service.js';
import type { BrainWithAccessDto, EmailSignInDto, UserDto } from '../api/types.js';
import type { ConnectionManager, ServerEntry } from './connection.js';

/** Runtime status of a server. Never persisted. */
export type ServerStatus =
  | 'signedOut'        // no session stored
  | 'signingIn'
  | 'connected'
  | 'authExpired'      // refresh was rejected; tokens cleared
  | 'offline'          // network failure or timeout; tokens kept
  | 'unsupportedAuth'  // the server advertises no sign-in method the extension supports
  | 'error';           // anything else, with a message

export type SignInProvider = 'entra' | 'google';

/**
 * Everything the extension holds for one server: its own token storage, API
 * client, auth service and data services, plus its status and cached brains.
 * Sessions are independent, so one server failing never affects another.
 */
export class ServerSession {
  readonly tokenStorage: TokenStorage;
  readonly apiClient: ApiClient;
  readonly authService: AuthService;
  readonly brainService: BrainService;
  readonly neuronService: NeuronService;

  private _status: ServerStatus = 'signedOut';
  /**
   * Whether a sign-in is stored. Kept apart from status because a server can
   * be offline or failing both with and without a stored session.
   */
  private sessionStored = false;
  private _statusMessage: string | undefined;
  private _user: UserDto | undefined;
  private _brains: BrainWithAccessDto[] | undefined;
  private _brainsError: string | undefined;
  private _brainsVersion = 0;
  private brainsLoad: Promise<BrainWithAccessDto[]> | undefined;
  private lastEntry: ServerEntry;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly _onDidChange = new vscode.EventEmitter<ServerSession>();
  /** Fires when status, user or cached brains change. */
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly registry: ConnectionManager,
    readonly serverId: string,
    secrets: vscode.SecretStorage,
  ) {
    const entry = registry.get(serverId);
    if (!entry) {
      throw new Error(`Unknown server ${serverId}`);
    }
    this.lastEntry = entry;
    this.tokenStorage = new TokenStorage(secrets, serverId);
    this.apiClient = new ApiClient(entry.baseUrl, this.tokenStorage);
    this.authService = new AuthService(() => this.entry, this.tokenStorage, this.apiClient);
    this.apiClient.setRefreshHandler(() => this.authService.refreshToken());
    this.brainService = new BrainService(this.apiClient);
    this.neuronService = new NeuronService(this.apiClient);

    this.disposables.push(
      this.authService.onAuthStateChanged((state) => {
        this._brainsError = undefined;
        this.sessionStored = state.authenticated;
        if (state.authenticated) {
          this._user = state.user;
          this._brains = undefined;
          this.setStatus('connected');
        } else if (this._status !== 'authExpired') {
          this._user = undefined;
          this._brains = undefined;
          this.setStatus(this.signedOutStatus());
        }
      }),
    );
  }

  /** The current registry entry (the last known one if the server has just been removed). */
  get entry(): ServerEntry {
    const current = this.registry.get(this.serverId);
    if (current) {
      this.lastEntry = current;
    }
    return this.lastEntry;
  }

  get status(): ServerStatus { return this._status; }
  get statusMessage(): string | undefined { return this._statusMessage; }
  get user(): UserDto | undefined { return this._user; }
  /** Brains from the last successful load, or undefined if never loaded. */
  get brains(): BrainWithAccessDto[] | undefined { return this._brains; }
  get isLoadingBrains(): boolean { return this.brainsLoad !== undefined; }
  /** Increments on every successful brains load, so caches keyed on it know to refresh. */
  get brainsVersion(): number { return this._brainsVersion; }
  /** Message from the last failed brains load, cleared by the next success. */
  get brainsError(): string | undefined { return this._brainsError; }
  /** True when a sign-in is stored for this server, whatever its current status. */
  get hasSession(): boolean {
    return this.sessionStored;
  }

  /** Read the stored session. A stored session is assumed valid until the first API call says otherwise. */
  async initialize(): Promise<void> {
    const state = await this.authService.initialize();
    this.sessionStored = state.authenticated;
    if (state.authenticated && !this.isUnsupported()) {
      this._user = state.user;
      this.setStatus(this.entry.needsDiscovery ? 'offline' : 'connected');
    } else {
      this.setStatus(this.signedOutStatus());
    }
  }

  async signIn(provider: SignInProvider): Promise<void> {
    await this.runSignIn(() =>
      provider === 'google' ? this.authService.signInWithGoogle() : this.authService.signInWithMicrosoft(),
    );
  }

  async signInWithEmail(dto: EmailSignInDto): Promise<void> {
    await this.runSignIn(() => this.authService.signInWithEmail(dto));
  }

  cancelSignIn(): void {
    this.authService.cancelSignIn();
  }

  async signOut(): Promise<void> {
    this._status = 'signedOut';
    await this.authService.signOut();
  }

  /** Load brains, sharing one request between concurrent callers. */
  async loadBrains(force = false): Promise<BrainWithAccessDto[]> {
    if (this.brainsLoad && !force) {
      return this.brainsLoad;
    }
    const load = this.call(() => this.brainService.listBrains())
      .then((brains) => {
        this._brains = Array.isArray(brains) ? brains : [];
        this._brainsError = undefined;
        this._brainsVersion++;
        return this._brains;
      }, (err: unknown) => {
        this._brainsError = err instanceof Error ? err.message : String(err);
        throw err;
      })
      .finally(() => {
        if (this.brainsLoad === load) {
          this.brainsLoad = undefined;
        }
        this._onDidChange.fire(this);
      });
    this.brainsLoad = load;
    this._onDidChange.fire(this);
    return load;
  }

  /**
   * Manual refresh: re-run Hive discovery, then reload brains if signed in.
   * Errors are reflected in the status rather than thrown.
   */
  async refresh(): Promise<void> {
    if (this._status === 'signingIn') {
      return;
    }
    if (this.entry.kind === 'hive') {
      try {
        await this.registry.refreshDiscovery(this.serverId);
      } catch (err) {
        this.applyError(err);
        return;
      }
      if (this.isUnsupported()) {
        this.setStatus('unsupportedAuth');
        return;
      }
    }

    if (!(await this.tokenStorage.hasTokens())) {
      // Keep "Session expired" visible until the user signs in again.
      if (this._status !== 'authExpired') {
        this.setStatus('signedOut');
      }
      return;
    }
    // A stored session on a server that is reachable and supported again.
    if (this._status === 'unsupportedAuth' || this._status === 'signedOut') {
      this.setStatus('connected');
    }
    await this.loadBrains(true).catch(() => undefined);
  }

  /** Timer refresh of the access token. Never throws. */
  async refreshToken(): Promise<void> {
    if (!(await this.tokenStorage.hasTokens())) {
      return;
    }
    const result = await this.authService.refreshToken().catch(() => 'unreachable' as const);
    if (result === 'ok') {
      if (this._status === 'offline' || this._status === 'error') {
        this.setStatus('connected');
        await this.loadBrains(true).catch(() => undefined);
      }
    } else if (result === 'rejected') {
      await this.expire();
    } else {
      this.setStatus('offline', `Could not reach ${this.entry.label}.`);
    }
  }

  /**
   * Run an API call for this server and keep the status in step with the
   * outcome: a rejected session becomes authExpired, a network failure
   * becomes offline, and a success clears either.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      if (this._status === 'offline' || this._status === 'error') {
        this.setStatus('connected');
      }
      return result;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        await this.expire();
      } else if (err instanceof NetworkError) {
        this.setStatus('offline', err.message);
      }
      throw err;
    }
  }

  dispose(): void {
    this.authService.cancelSignIn();
    this.authService.dispose();
    this.disposables.forEach((d) => d.dispose());
    this._onDidChange.dispose();
  }

  private async runSignIn(flow: () => Promise<void>): Promise<void> {
    if (this.isUnsupported()) {
      throw new Error(`${this.entry.label} has no sign-in method that the extension supports.`);
    }
    const previous = this._status;
    this.setStatus('signingIn');
    try {
      await flow();
    } finally {
      if (this._status === 'signingIn') {
        this.setStatus(previous === 'signingIn' ? 'signedOut' : previous, this._statusMessage);
      }
    }
  }

  private async expire(): Promise<void> {
    // Already signed out (or already expired): a late 401 from a request that
    // was in flight must not turn "Signed out" into "Session expired".
    if (!this.sessionStored) {
      return;
    }
    this._status = 'authExpired';
    this.sessionStored = false;
    this._user = undefined;
    this._brains = undefined;
    await this.tokenStorage.clear();
    this.setStatus('authExpired', 'Your session has expired. Sign in again.');
  }

  private applyError(err: unknown): void {
    if (err instanceof NetworkError) {
      this.setStatus('offline', err.message);
    } else {
      this.setStatus('error', err instanceof Error ? err.message : String(err));
    }
  }

  private isUnsupported(): boolean {
    const entry = this.entry;
    return !entry.needsDiscovery && entry.authProviders.length === 0;
  }

  private signedOutStatus(): ServerStatus {
    return this.isUnsupported() ? 'unsupportedAuth' : 'signedOut';
  }

  private setStatus(status: ServerStatus, message?: string): void {
    this._status = status;
    this._statusMessage = message;
    this._onDidChange.fire(this);
  }
}
