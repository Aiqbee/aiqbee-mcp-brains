import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  buildCloudEntry,
  CLOUD_SERVER_ID,
  normaliseUrl,
  SERVERS_STORAGE_KEY,
  type ServerEntry,
} from './connection.js';
import { sessionSecretKey, type AuthType, type StoredSession } from '../auth/token-storage.js';
import type { UserDto } from '../api/types.js';

export const MIGRATION_MARKER_KEY = 'aiqbee.migration.v1';

/** Storage keys used by versions before multi-server support. */
export const LEGACY_CONNECTION_KEY = 'aiqbee-connection';
export const LEGACY_SECRET_KEYS = {
  accessToken: 'aiqbee-access-token',
  refreshToken: 'aiqbee-refresh-token',
  authType: 'aiqbee-auth-type',
  userJson: 'aiqbee-user-json',
} as const;

interface LegacyConnection {
  backendType: 'cloud' | 'hive';
  baseUrl: string;
  mcpBaseUrl: string;
  authProviders: string[];
  label: string;
}

/**
 * Move the single legacy connection and its tokens into the multi-server
 * layout. Runs once; it is idempotent, and legacy data is deleted only after
 * the new data has been written, so a failure part-way is retried next time.
 */
export async function migrateLegacyConnection(
  globalState: vscode.Memento,
  secrets: vscode.SecretStorage,
): Promise<void> {
  if (globalState.get<boolean>(MIGRATION_MARKER_KEY)) {
    return;
  }

  const servers = [...(globalState.get<ServerEntry[]>(SERVERS_STORAGE_KEY) ?? [])];
  if (!servers.some((s) => s.id === CLOUD_SERVER_ID)) {
    servers.unshift(buildCloudEntry());
  }

  // 1. The legacy Hive connection, if there was one, becomes a Hive entry.
  let activeServerId = CLOUD_SERVER_ID;
  const legacy = globalState.get<LegacyConnection>(LEGACY_CONNECTION_KEY);
  if (legacy?.backendType === 'hive' && legacy.baseUrl) {
    // The legacy URL passed the same validation when it was saved; fall back to
    // it unchanged rather than failing (and retrying) the migration forever.
    let baseUrl: string;
    try {
      baseUrl = normaliseUrl(legacy.baseUrl);
    } catch {
      baseUrl = legacy.baseUrl.replace(/\/+$/, '');
    }
    const existing = servers.find((s) => s.baseUrl.toLowerCase() === baseUrl.toLowerCase());
    if (existing) {
      activeServerId = existing.id;
    } else {
      const entry: ServerEntry = {
        id: crypto.randomUUID(),
        kind: 'hive',
        label: legacy.label || new URL(baseUrl).host,
        baseUrl,
        mcpBaseUrl: (legacy.mcpBaseUrl || baseUrl).replace(/\/+$/, ''),
        authProviders: legacy.authProviders ?? [],
        origin: 'user',
        addedAt: new Date().toISOString(),
      };
      servers.push(entry);
      activeServerId = entry.id;
    }
  }

  // 2. The legacy tokens belong to whichever server was active.
  const [accessToken, refreshToken, authType, userJson] = await Promise.all([
    secrets.get(LEGACY_SECRET_KEYS.accessToken),
    secrets.get(LEGACY_SECRET_KEYS.refreshToken),
    secrets.get(LEGACY_SECRET_KEYS.authType),
    secrets.get(LEGACY_SECRET_KEYS.userJson),
  ]);
  const targetKey = sessionSecretKey(activeServerId);
  if (accessToken && !(await secrets.get(targetKey))) {
    const session: StoredSession = {
      accessToken,
      refreshToken: refreshToken || undefined,
      authType: (authType as AuthType | undefined) || undefined,
      user: parseUser(userJson),
    };
    await secrets.store(targetKey, JSON.stringify(session));
  }

  // 3. Write the new layout, then the marker.
  await globalState.update(SERVERS_STORAGE_KEY, servers);
  await globalState.update(MIGRATION_MARKER_KEY, true);

  // 4. Only now remove the legacy data.
  await Promise.all(Object.values(LEGACY_SECRET_KEYS).map((key) => secrets.delete(key)));
  await globalState.update(LEGACY_CONNECTION_KEY, undefined);
}

function parseUser(json: string | undefined): UserDto | undefined {
  if (!json) {
    return undefined;
  }
  try {
    return JSON.parse(json) as UserDto;
  } catch {
    return undefined;
  }
}
