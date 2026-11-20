import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionManager, SERVERS_STORAGE_KEY, type ServerEntry } from '../connection/connection.js';
import { SessionManager } from '../connection/session-manager.js';
import { sessionSecretKey } from '../auth/token-storage.js';
import { ServersTreeProvider, type BrainNode, type PlaceholderNode, type ServerNode, type TreeNode } from './servers-tree.js';
import { createMemento, createSecrets, flush, jsonResponse } from '../__mocks__/test-helpers.js';

const HIVE: ServerEntry = {
  id: 'hive-1',
  kind: 'hive',
  label: 'Team Hive',
  baseUrl: 'https://hive.example.com',
  mcpBaseUrl: 'https://hive.example.com',
  authProviders: ['entra'],
  origin: 'user',
  addedAt: '2026-01-01T00:00:00.000Z',
};

const BRAINS = [
  { id: 'b2', name: 'Zeta', isPersonal: true, allowMCPEditing: true, accessLevel: 0, canWrite: false, canManageAccess: false },
  { id: 'b1', name: 'Alpha', isPersonal: true, allowMCPEditing: true, accessLevel: 2, canWrite: true, canManageAccess: true },
];

describe('ServersTreeProvider', () => {
  let registry: ConnectionManager;
  let sessions: SessionManager;
  let tree: ServersTreeProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  async function setup(servers: ServerEntry[], stored: Record<string, object> = {}) {
    const memento = createMemento({ [SERVERS_STORAGE_KEY]: servers });
    const secrets = createSecrets(
      Object.fromEntries(Object.entries(stored).map(([id, s]) => [sessionSecretKey(id), JSON.stringify(s)])),
    );
    registry = new ConnectionManager(memento as any);
    sessions = new SessionManager(registry, secrets);
    await sessions.initialize();
    tree = new ServersTreeProvider(sessions);
  }

  const server = (id: string): ServerNode => ({ type: 'server', serverId: id });

  beforeEach(() => {
    process.env.VITE_API_URL = 'https://api.aiqbee.com';
    fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/brains/with-access')) { return jsonResponse(BRAINS); }
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    tree.dispose();
    sessions.dispose();
    registry.dispose();
    vi.unstubAllGlobals();
  });

  it('is empty for a new user so the welcome view shows', async () => {
    await setup([]);
    expect(tree.getChildren()).toEqual([]);
  });

  it('lists every server once a Hive Server is added or anyone is signed in', async () => {
    await setup([HIVE]);
    expect(tree.getChildren()).toEqual([server('cloud'), server('hive-1')]);
  });

  it('shows a Sign in child for a signed-out server', async () => {
    await setup([HIVE]);
    const [child] = tree.getChildren(server('hive-1')) as PlaceholderNode[];
    expect(child.label).toBe('Sign in…');
    expect(tree.getTreeItem(child).command?.command).toBe('aiqbee.signIn');
  });

  it('describes each server status and sets a contextValue for menus', async () => {
    await setup([HIVE, { ...HIVE, id: 'hive-2', label: 'Locked', baseUrl: 'https://locked.example.com', authProviders: [] }]);

    const cloud = tree.getTreeItem(server('cloud'));
    const hive = tree.getTreeItem(server('hive-1'));
    const locked = tree.getTreeItem(server('hive-2'));

    expect(cloud.description).toBe('Sign in');
    expect(cloud.contextValue).toBe('server.signedOut.cloud.nosession');
    expect(hive.contextValue).toBe('server.signedOut.hive.nosession.removable');
    expect(locked.description).toBe('No supported sign-in method');
    expect(locked.contextValue).toBe('server.unsupportedAuth.hive.nosession.removable');
    expect((locked.iconPath as any).id).toBe('error');
  });

  it('loads and lists brains for a connected server, sorted by name', async () => {
    await setup([HIVE], { 'hive-1': { accessToken: 't', user: { email: 'me@example.com' } } });

    expect((tree.getChildren(server('hive-1')) as PlaceholderNode[])[0].label).toBe('Loading…');
    await flush();
    const children = tree.getChildren(server('hive-1')) as BrainNode[];

    expect(children.map((c) => c.brain.name)).toEqual(['Alpha', 'Zeta']);
    expect(tree.getTreeItem(server('hive-1')).description).toBe('me@example.com');
    const alpha = tree.getTreeItem(children[0]);
    expect(alpha.description).toBe('Owner');
    expect(alpha.contextValue).toBe('brain.writable');
    expect(alpha.command).toMatchObject({ command: 'aiqbee.openBrainGraph', arguments: [children[0]] });
    expect(tree.getTreeItem(children[1]).contextValue).toBe('brain.readonly');
  });

  it('keeps showing cached brains, marked offline, when the server goes offline', async () => {
    await setup([HIVE], { 'hive-1': { accessToken: 't' } });
    await sessions.require('hive-1').loadBrains();
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await sessions.require('hive-1').loadBrains(true).catch(() => undefined);

    const children = tree.getChildren(server('hive-1')) as BrainNode[];

    expect(tree.getTreeItem(server('hive-1')).description).toBe('Offline');
    expect(children).toHaveLength(2);
    expect(tree.getTreeItem(children[0]).description).toBe('Owner · offline');
  });

  it('treats a signed-out server that cannot be reached as signed out, with a retry', async () => {
    await setup([HIVE]);
    await sessions.require('hive-1').refresh(); // discovery fails: fetch only answers brains

    const item = tree.getTreeItem(server('hive-1'));
    const [child] = tree.getChildren(server('hive-1')) as PlaceholderNode[];

    expect(item.description).toBe('Offline');
    expect(item.contextValue).toBe('server.offline.hive.nosession.removable');
    expect(child.key).toBe('retry');
  });

  it('marks a signed-in server as having a session, even when offline', async () => {
    await setup([HIVE], { 'hive-1': { accessToken: 't' } });
    await sessions.require('hive-1').refresh();

    expect(tree.getTreeItem(server('hive-1')).contextValue).toBe('server.offline.hive.session.removable');
  });

  it('refetches tooltip counts after the brain list reloads', async () => {
    await setup([HIVE], { 'hive-1': { accessToken: 't' } });
    let total = 3;
    fetchMock.mockImplementation(async (url: string) => jsonResponse(
      url.includes('/api/brains/with-access') ? BRAINS : { records: [], totalRecords: total, page: 1, totalPages: 1 },
    ));
    const session = sessions.require('hive-1');
    await session.loadBrains();
    const first = (tree.getChildren(server('hive-1')) as TreeNode[])[0];
    await tree.resolveTreeItem(tree.getTreeItem(first), first);

    total = 9;
    await session.loadBrains(true);
    const again = (tree.getChildren(server('hive-1')) as TreeNode[])[0];
    const item = await tree.resolveTreeItem(tree.getTreeItem(again), again);

    expect((item.tooltip as any).value).toContain('9 neurons');
  });

  it('offers a retry instead of reloading forever when the brain list fails', async () => {
    await setup([HIVE], { 'hive-1': { accessToken: 't' } });
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    tree.getChildren(server('hive-1'));
    await flush();
    const callsAfterFirstLoad = fetchMock.mock.calls.length;

    const [child] = tree.getChildren(server('hive-1')) as PlaceholderNode[];

    expect(child.key).toBe('retry');
    expect(tree.getTreeItem(child).command?.command).toBe('aiqbee.refresh');
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstLoad);
  });

  it('offers to create a brain when a server has none', async () => {
    await setup([HIVE], { 'hive-1': { accessToken: 't' } });
    fetchMock.mockResolvedValue(jsonResponse([]));
    tree.getChildren(server('hive-1'));
    await flush();

    const [child] = tree.getChildren(server('hive-1')) as PlaceholderNode[];
    expect(tree.getTreeItem(child).command?.command).toBe('aiqbee.createBrain');
  });

  it('fires a refresh when a session changes', async () => {
    await setup([HIVE], { 'hive-1': { accessToken: 't' } });
    const listener = vi.fn();
    tree.onDidChangeTreeData(listener);

    await sessions.require('hive-1').signOut();

    expect(listener).toHaveBeenCalled();
  });

  it('adds neuron counts to a brain tooltip lazily', async () => {
    await setup([HIVE], { 'hive-1': { accessToken: 't' } });
    fetchMock.mockImplementation(async (url: string) => jsonResponse(
      url.includes('/api/brains/with-access') ? BRAINS : { records: [], totalRecords: 7, page: 1, totalPages: 1 },
    ));
    await sessions.require('hive-1').loadBrains();
    const node = (tree.getChildren(server('hive-1')) as TreeNode[])[0];

    const item = await tree.resolveTreeItem(tree.getTreeItem(node), node);

    expect((item.tooltip as any).value).toContain('7 neurons · 7 types · 7 synapses');
  });
});
