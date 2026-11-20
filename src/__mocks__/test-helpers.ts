// Shared fakes for unit tests. These stand in for VS Code storage and the
// network; the code under test is always the real implementation.
import { vi } from 'vitest';
import type { SecretStorage } from 'vscode';

/** In-memory vscode.Memento. */
export function createMemento(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get: <T>(key: string, defaultValue?: T) => (store.has(key) ? store.get(key) as T : defaultValue),
    update: vi.fn(async (key: string, value: unknown) => {
      if (value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    }),
    keys: () => [...store.keys()],
    setKeysForSync: () => {},
    _store: store,
  };
}

/** In-memory vscode.SecretStorage. */
export function createSecrets(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const secrets = {
    get: vi.fn(async (key: string) => data.get(key)),
    store: vi.fn(async (key: string, value: string) => { data.set(key, value); }),
    delete: vi.fn(async (key: string) => { data.delete(key); }),
    keys: async () => [...data.keys()],
    onDidChange: () => ({ dispose: () => {} }),
    _data: data,
  };
  return secrets as typeof secrets & SecretStorage;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

export function hiveDiscovery(overrides: Record<string, unknown> = {}) {
  return {
    backendType: 'hive',
    version: '1.4.0',
    authProviders: ['entra', 'google'],
    mcpBaseUrl: 'https://hive.example.com',
    ...overrides,
  };
}

/** Let pending promise callbacks run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}
