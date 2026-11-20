import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { SidebarProvider } from './sidebar-provider.js';
import { ConnectionManager, SERVERS_STORAGE_KEY, type ServerEntry } from '../connection/connection.js';
import { SessionManager } from '../connection/session-manager.js';
import { sessionSecretKey } from '../auth/token-storage.js';
import { AuthStateError, SignInCancelledError } from '../auth/auth-service.js';
import { createMemento, createSecrets, flush } from '../__mocks__/test-helpers.js';

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

/** The provider's private message handler, which the webview drives through postMessage. */
function handlerOf(provider: SidebarProvider): (message: any) => Promise<void> {
  return (provider as any).handleMessage.bind(provider);
}

describe('SidebarProvider', () => {
  let registry: ConnectionManager;
  let sessions: SessionManager;
  let provider: SidebarProvider;
  let posted: any[];
  let handle: (message: any) => Promise<void>;

  beforeEach(async () => {
    process.env.VITE_API_URL = 'https://api.aiqbee.com';
    registry = new ConnectionManager(createMemento({ [SERVERS_STORAGE_KEY]: [HIVE] }) as any);
    sessions = new SessionManager(registry, createSecrets({
      [sessionSecretKey('cloud')]: JSON.stringify({ accessToken: 'c', user: { givenName: 'A', familyName: 'B', email: 'a@b.c' } }),
    }));
    await sessions.initialize();
    provider = new SidebarProvider({ fsPath: '/ext' } as any, sessions, 'https://app.aiqbee.com', () => 'production');
    posted = [];
    (provider as any).view = { webview: { postMessage: (m: unknown) => { posted.push(m); return Promise.resolve(true); } } };
    handle = handlerOf(provider);
  });

  afterEach(() => {
    provider.dispose();
    sessions.dispose();
    registry.dispose();
    vi.restoreAllMocks();
  });

  const last = (command: string) => [...posted].reverse().find((m) => m.command === command);

  it('sends every server with its status on ready', async () => {
    await handle({ command: 'ready' });

    const { servers, environment } = last('serversChanged').payload;
    expect(environment).toBe('production');
    expect(servers).toEqual([
      expect.objectContaining({
        id: 'cloud', kind: 'cloud', status: 'connected', removable: false,
        user: { givenName: 'A', familyName: 'B', email: 'a@b.c' },
        signUpUrl: 'https://app.aiqbee.com/signup',
      }),
      expect.objectContaining({ id: 'hive-1', kind: 'hive', status: 'signedOut', removable: true, signUpUrl: undefined }),
    ]);
  });

  it('does not post before the webview is ready', async () => {
    await sessions.require('hive-1').signOut();
    expect(posted).toEqual([]);
  });

  it('pushes updates when a session changes', async () => {
    await handle({ command: 'ready' });
    posted = [];

    await sessions.require('cloud').signOut();

    expect(last('serversChanged').payload.servers[0].status).toBe('signedOut');
  });

  it('routes sign-in to the session named by serverId', async () => {
    const hive = vi.spyOn(sessions.require('hive-1'), 'signIn').mockResolvedValue();
    const cloud = vi.spyOn(sessions.require('cloud'), 'signIn').mockResolvedValue();

    await handle({ command: 'signIn', payload: { serverId: 'hive-1', provider: 'entra' } });

    expect(hive).toHaveBeenCalledWith('entra');
    expect(cloud).not.toHaveBeenCalled();
  });

  it('routes email sign-in with its credentials', async () => {
    const email = vi.spyOn(sessions.require('cloud'), 'signInWithEmail').mockResolvedValue();

    await handle({ command: 'signInEmail', payload: { serverId: 'cloud', email: 'x@y.z', password: 'pw' } });

    expect(email).toHaveBeenCalledWith({ email: 'x@y.z', password: 'pw' });
  });

  it('signs out only the named server', async () => {
    await handle({ command: 'signOut', payload: { serverId: 'cloud' } });

    expect(sessions.require('cloud').status).toBe('signedOut');
    expect(sessions.require('hive-1').status).toBe('signedOut');
  });

  it('returns an error message for an unknown serverId', async () => {
    await handle({ command: 'signOut', payload: { serverId: 'nope' } });

    expect(last('error').payload).toEqual({ message: 'That server is no longer configured.', serverId: 'nope' });
  });

  it('shows an account action with the sign-up page for cloud only', async () => {
    vi.spyOn(sessions.require('cloud'), 'signIn').mockRejectedValue(new AuthStateError('No account', 'SignUpRequired'));
    vi.spyOn(sessions.require('hive-1'), 'signIn').mockRejectedValue(new AuthStateError('No account', 'SignUpRequired'));

    await handle({ command: 'signIn', payload: { serverId: 'cloud', provider: 'google' } });
    expect(last('authActionRequired').payload).toEqual({
      serverId: 'cloud', state: 'SignUpRequired', message: 'No account', signUpUrl: 'https://app.aiqbee.com/signup',
    });

    await handle({ command: 'signIn', payload: { serverId: 'hive-1', provider: 'entra' } });
    expect(last('authActionRequired').payload.signUpUrl).toBeUndefined();
  });

  it('stays quiet when the user cancels a sign-in', async () => {
    vi.spyOn(sessions.require('hive-1'), 'signIn').mockRejectedValue(new SignInCancelledError());

    await handle({ command: 'signIn', payload: { serverId: 'hive-1', provider: 'entra' } });

    expect(last('error')).toBeUndefined();
  });

  it('reports other sign-in failures against the server', async () => {
    vi.spyOn(sessions.require('hive-1'), 'signIn').mockRejectedValue(new Error('Token exchange failed'));

    await handle({ command: 'signIn', payload: { serverId: 'hive-1', provider: 'entra' } });

    expect(last('error').payload).toEqual({ message: 'Token exchange failed', serverId: 'hive-1' });
  });

  it('hands add and remove to the commands so they share one flow', async () => {
    const exec = vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);

    await handle({ command: 'addServer', payload: { url: 'hive2.example.com' } });
    await handle({ command: 'removeServer', payload: { serverId: 'hive-1' } });

    expect(exec).toHaveBeenCalledWith('aiqbee.addServer', 'hive2.example.com');
    expect(exec).toHaveBeenCalledWith('aiqbee.removeServer', 'hive-1');
  });

  it('opens only web links', async () => {
    const open = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

    await handle({ command: 'openExternal', payload: { url: 'https://app.aiqbee.com/signup' } });
    await handle({ command: 'openExternal', payload: { url: 'command:workbench.action.terminal.new' } });

    expect(open).toHaveBeenCalledTimes(1);
    expect(last('error').payload.message).toBe('Only web links can be opened.');
  });

  it('opens the email form once the webview is ready', async () => {
    vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);

    provider.showEmailSignIn('cloud');
    expect(last('showEmailSignIn')).toBeUndefined();

    await handle({ command: 'ready' });
    await flush();
    expect(last('showEmailSignIn').payload).toEqual({ serverId: 'cloud' });
  });
});
