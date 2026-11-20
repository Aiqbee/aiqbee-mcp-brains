import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { NetworkError } from '../api/api-client.js';

export type ServerKind = 'cloud' | 'hive';
export type ServerOrigin = 'builtin' | 'user' | 'setting';

/** A configured backend: the built-in Aiqbee Cloud entry or a Hive Server. */
export interface ServerEntry {
  /** 'cloud' for the built-in entry; a random UUID for Hive Servers. */
  id: string;
  kind: ServerKind;
  /** User-editable display name. */
  label: string;
  /** Normalised API base URL, no trailing slash. */
  baseUrl: string;
  /** MCP base URL, no trailing slash. */
  mcpBaseUrl: string;
  /** Sign-in providers the extension supports on this server. Empty means none. */
  authProviders: string[];
  /** Hive Server version from discovery. */
  version?: string;
  origin: ServerOrigin;
  /** ISO timestamp. */
  addedAt: string;
  /** True when discovery has not yet succeeded (e.g. a settings entry added while offline). */
  needsDiscovery?: boolean;
}

export interface ServerRef { serverId: string }
export interface BrainRef extends ServerRef { brainId: string }

export const CLOUD_SERVER_ID = 'cloud';
export const SERVERS_STORAGE_KEY = 'aiqbee.servers.v1';
export const SUPPORTED_AUTH_PROVIDERS = ['entra', 'google', 'email'];

interface HiveDiscoveryResponse {
  backendType: string;
  version?: string;
  authProviders?: string[];
  mcpBaseUrl?: string;
}

interface DiscoveryResult {
  mcpBaseUrl: string;
  authProviders: string[];
  version?: string;
}

export class DuplicateServerError extends Error {
  constructor(public readonly existing: ServerEntry) {
    super(`${existing.label} (${existing.baseUrl}) is already in your server list.`);
    this.name = 'DuplicateServerError';
  }
}

/** Build the built-in Aiqbee Cloud entry from build-time configuration. */
export function buildCloudEntry(label = 'Aiqbee Cloud', addedAt = new Date().toISOString()): ServerEntry {
  const apiUrl = (process.env.VITE_API_URL || 'https://api.aiqbee.com').replace(/\/+$/, '');
  const mcpUrl = apiUrl.replace(/^(https?:\/\/)api\./, '$1mcp.');
  return {
    id: CLOUD_SERVER_ID,
    kind: 'cloud',
    label,
    baseUrl: apiUrl,
    mcpBaseUrl: mcpUrl,
    authProviders: [...SUPPORTED_AUTH_PROVIDERS],
    origin: 'builtin',
    addedAt,
  };
}

/**
 * Registry of configured servers. The cloud entry always exists; any number of
 * Hive Servers can be added. Persisted in globalState (secrets live elsewhere).
 */
export class ConnectionManager {
  private readonly _onDidChangeServers = new vscode.EventEmitter<void>();
  readonly onDidChangeServers = this._onDidChangeServers.event;

  private readonly _onDidRemoveServer = new vscode.EventEmitter<ServerEntry>();
  /** Fires after a server has been removed from the list. */
  readonly onDidRemoveServer = this._onDidRemoveServer.event;

  private servers: ServerEntry[];
  private settingsSync: Promise<unknown> = Promise.resolve();

  constructor(private readonly globalState: vscode.Memento) {
    this.servers = this.load();
  }

  list(): ServerEntry[] {
    return [...this.servers];
  }

  get(id: string): ServerEntry | undefined {
    return this.servers.find((s) => s.id === id);
  }

  findByUrl(url: string): ServerEntry | undefined {
    const baseUrl = normaliseUrl(url);
    return this.servers.find((s) => s.baseUrl.toLowerCase() === baseUrl.toLowerCase());
  }

  /**
   * Add a Hive Server. Runs discovery first; a server that advertises no
   * supported sign-in provider is still added (its status is unsupportedAuth).
   * Throws DuplicateServerError if the URL is already configured.
   */
  async addHive(url: string, options: { label?: string; origin?: ServerOrigin } = {}): Promise<ServerEntry> {
    const baseUrl = normaliseUrl(url);
    const existing = this.findByUrl(baseUrl);
    if (existing) {
      throw new DuplicateServerError(existing);
    }

    const discovery = await fetchDiscovery(baseUrl);
    // Discovery can take seconds; another add of the same URL may have finished meanwhile.
    const added = this.findByUrl(baseUrl);
    if (added) {
      throw new DuplicateServerError(added);
    }
    const entry: ServerEntry = {
      id: crypto.randomUUID(),
      kind: 'hive',
      label: options.label?.trim() || new URL(baseUrl).host,
      baseUrl,
      mcpBaseUrl: discovery.mcpBaseUrl,
      authProviders: discovery.authProviders,
      version: discovery.version,
      origin: options.origin ?? 'user',
      addedAt: new Date().toISOString(),
    };
    await this.save([...this.servers, entry]);
    return entry;
  }

  async rename(id: string, label: string): Promise<void> {
    const trimmed = label.trim();
    if (!trimmed) {
      throw new Error('Server name cannot be empty.');
    }
    await this.update(id, { label: trimmed });
  }

  /** Remove a user-added Hive Server. The cloud entry and settings entries cannot be removed. */
  async remove(id: string): Promise<void> {
    const entry = this.require(id);
    if (entry.origin !== 'user') {
      throw new Error(
        entry.origin === 'builtin'
          ? 'Aiqbee Cloud cannot be removed. You can sign out instead.'
          : `${entry.label} is managed by the aiqbee.servers setting. Remove it there.`,
      );
    }
    await this.save(this.servers.filter((s) => s.id !== id));
    this._onDidRemoveServer.fire(entry);
  }

  /** Re-run Hive discovery and store the result. Throws NetworkError when unreachable. */
  async refreshDiscovery(id: string): Promise<ServerEntry> {
    const entry = this.require(id);
    if (entry.kind !== 'hive') {
      return entry;
    }
    const discovery = await fetchDiscovery(entry.baseUrl);
    return this.update(id, {
      mcpBaseUrl: discovery.mcpBaseUrl,
      authProviders: discovery.authProviders,
      version: discovery.version,
      needsDiscovery: undefined,
    });
  }

  /**
   * Reconcile settings-managed entries with the aiqbee.servers setting: add
   * new URLs, refresh labels, and drop entries whose URL was removed. A URL
   * that is unreachable is still added (needsDiscovery) so it shows as offline.
   */
  syncSettingServers(settings: { url: string; label?: string }[]): Promise<void> {
    // Serialise syncs: activation and a settings change can overlap.
    const run = this.settingsSync.then(() => this.doSyncSettingServers(settings));
    this.settingsSync = run.catch(() => undefined);
    return run;
  }

  private async doSyncSettingServers(settings: { url: string; label?: string }[]): Promise<void> {
    const wanted = new Map<string, { url: string; label?: string }>();
    for (const s of settings) {
      wanted.set(s.url.toLowerCase(), s);
    }

    // Discover new URLs first. The list is read again afterwards, so servers
    // added or renamed while discovery was running are never lost.
    const known = new Set(this.servers.map((s) => s.baseUrl.toLowerCase()));
    const built = await Promise.all(
      [...wanted].filter(([key]) => !known.has(key)).map(([, s]) => buildSettingEntry(s)),
    );

    const current = this.servers;
    const removed = current.filter((s) => s.origin === 'setting' && !wanted.has(s.baseUrl.toLowerCase()));
    let next = current
      .filter((s) => !removed.includes(s))
      .map((s) => {
        const label = wanted.get(s.baseUrl.toLowerCase())?.label;
        return s.origin === 'setting' && label && s.label !== label ? { ...s, label } : s;
      });
    for (const entry of built) {
      if (!next.some((s) => s.baseUrl.toLowerCase() === entry.baseUrl.toLowerCase())) {
        next = [...next, entry];
      }
    }

    if (removed.length === 0 && sameEntries(next, current)) {
      return;
    }
    await this.save(next);
    for (const entry of removed) {
      this._onDidRemoveServer.fire(entry);
    }
  }

  dispose(): void {
    this._onDidChangeServers.dispose();
    this._onDidRemoveServer.dispose();
  }

  private require(id: string): ServerEntry {
    const entry = this.get(id);
    if (!entry) {
      throw new Error('That server is no longer configured.');
    }
    return entry;
  }

  private async update(id: string, patch: Partial<ServerEntry>): Promise<ServerEntry> {
    const entry = { ...this.require(id), ...patch };
    await this.save(this.servers.map((s) => (s.id === id ? entry : s)));
    return entry;
  }

  /**
   * Update the in-memory list immediately, so a concurrent operation that
   * resumes during the write already sees it, then persist. A failed write
   * restores the previous list (unless something else has changed it since).
   */
  private async save(servers: ServerEntry[]): Promise<void> {
    const previous = this.servers;
    this.servers = servers;
    try {
      await this.globalState.update(SERVERS_STORAGE_KEY, servers);
    } catch (err) {
      if (this.servers === servers) {
        this.servers = previous;
      }
      throw err;
    }
    this._onDidChangeServers.fire();
  }

  /** Load the stored list, always rebuilding the cloud entry's URLs from the current build. */
  private load(): ServerEntry[] {
    const stored = this.globalState.get<ServerEntry[]>(SERVERS_STORAGE_KEY) ?? [];
    const storedCloud = stored.find((s) => s.id === CLOUD_SERVER_ID);
    const cloud = buildCloudEntry(storedCloud?.label, storedCloud?.addedAt);
    return [cloud, ...stored.filter((s) => s.id !== CLOUD_SERVER_ID && s.kind === 'hive')];
  }
}

async function buildSettingEntry(setting: { url: string; label?: string }): Promise<ServerEntry> {
  const base: ServerEntry = {
    id: crypto.randomUUID(),
    kind: 'hive',
    label: setting.label?.trim() || new URL(setting.url).host,
    baseUrl: setting.url,
    mcpBaseUrl: setting.url,
    authProviders: [],
    origin: 'setting',
    addedAt: new Date().toISOString(),
  };
  try {
    const discovery = await fetchDiscovery(setting.url);
    return { ...base, ...discovery };
  } catch {
    return { ...base, needsDiscovery: true };
  }
}

function sameEntries(a: ServerEntry[], b: ServerEntry[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry === b[i]);
}

/** Fetch Hive discovery. Throws NetworkError when unreachable, Error when not a Hive Server. */
export async function fetchDiscovery(baseUrl: string): Promise<DiscoveryResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/vscode/discovery`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new NetworkError(`Could not reach ${baseUrl}.`, err);
  }

  if (!response.ok) {
    throw new Error(
      `Hive Server at ${baseUrl} returned ${response.status}. Is this a valid Hive Server URL?`,
    );
  }

  let data: HiveDiscoveryResponse;
  try {
    data = (await response.json()) as HiveDiscoveryResponse;
  } catch {
    throw new Error(`${baseUrl} did not return Hive Server discovery data.`);
  }

  if (data.backendType !== 'hive') {
    throw new Error('The server did not identify as a Hive Server.');
  }

  return {
    mcpBaseUrl: (data.mcpBaseUrl || baseUrl).replace(/\/+$/, ''),
    authProviders: (data.authProviders || []).filter((p) => SUPPORTED_AUTH_PROVIDERS.includes(p)),
    version: data.version,
  };
}

/** Normalise a user-entered server URL: add https://, strip trailing slashes, enforce HTTPS off localhost. */
export function normaliseUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('Server URLs must not contain a username or password.');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new Error('Hive Server URL must use HTTPS unless it is localhost');
  }

  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
}
