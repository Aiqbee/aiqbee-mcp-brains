import * as vscode from 'vscode';

export type BackendType = 'cloud' | 'hive';

export interface Connection {
  backendType: BackendType;
  baseUrl: string;
  mcpBaseUrl: string;
  authProviders: string[];
  label: string;
}

interface HiveDiscoveryResponse {
  backendType: string;
  version: string;
  authProviders: string[];
  mcpBaseUrl: string;
}

const STORAGE_KEY = 'aiqbee-connection';

export class ConnectionManager {
  private _onConnectionChanged = new vscode.EventEmitter<Connection>();
  readonly onConnectionChanged = this._onConnectionChanged.event;

  private cachedConnection: Connection | null = null;

  constructor(private readonly globalState: vscode.Memento) {}

  getConnection(): Connection {
    if (this.cachedConnection) {
      return this.cachedConnection;
    }

    const stored = this.globalState.get<Connection>(STORAGE_KEY);
    if (stored) {
      this.cachedConnection = stored;
      return stored;
    }

    return this.buildCloudConnection();
  }

  async connectToHive(url: string): Promise<Connection> {
    const baseUrl = normaliseUrl(url);

    const discovery = await this.fetchDiscovery(baseUrl);

    const connection: Connection = {
      backendType: 'hive',
      baseUrl,
      mcpBaseUrl: discovery.mcpBaseUrl.replace(/\/$/, ''),
      authProviders: discovery.authProviders,
      label: new URL(baseUrl).hostname,
    };

    await this.globalState.update(STORAGE_KEY, connection);
    this.cachedConnection = connection;
    this._onConnectionChanged.fire(connection);
    return connection;
  }

  async connectToCloud(): Promise<Connection> {
    const connection = this.buildCloudConnection();
    await this.globalState.update(STORAGE_KEY, undefined);
    this.cachedConnection = connection;
    this._onConnectionChanged.fire(connection);
    return connection;
  }

  async disconnect(): Promise<void> {
    await this.globalState.update(STORAGE_KEY, undefined);
    this.cachedConnection = null;
  }

  isHive(): boolean {
    return this.getConnection().backendType === 'hive';
  }

  private buildCloudConnection(): Connection {
    const apiUrl = process.env.VITE_API_URL || 'https://api.aiqbee.com';
    const mcpUrl = apiUrl.replace(/^(https?:\/\/)api\./, '$1mcp.');

    return {
      backendType: 'cloud',
      baseUrl: apiUrl,
      mcpBaseUrl: mcpUrl,
      authProviders: ['entra', 'google', 'email'],
      label: 'Aiqbee Cloud',
    };
  }

  private async fetchDiscovery(baseUrl: string): Promise<HiveDiscoveryResponse> {
    const url = `${baseUrl}/api/vscode/discovery`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        `Hive Server at ${baseUrl} returned ${response.status}. Is this a valid Hive Server URL?`,
      );
    }

    const data = (await response.json()) as HiveDiscoveryResponse;

    if (data.backendType !== 'hive') {
      throw new Error('The server did not identify as a Hive Server.');
    }

    if (!data.authProviders || data.authProviders.length === 0) {
      throw new Error('Hive Server has no authentication providers configured.');
    }

    return data;
  }

  dispose(): void {
    this._onConnectionChanged.dispose();
  }
}

function normaliseUrl(input: string): string {
  let url = input.trim();

  // Strip trailing slashes
  url = url.replace(/\/+$/, '');

  // Add https:// if no protocol
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // Validate it's a real URL
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  return url;
}
