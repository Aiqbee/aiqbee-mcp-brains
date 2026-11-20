import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { ConnectionManager, SERVERS_STORAGE_KEY, type ServerEntry } from '../connection/connection.js';
import { SessionManager } from '../connection/session-manager.js';
import { sessionSecretKey } from '../auth/token-storage.js';
import { AuthStateError, SignInCancelledError } from '../auth/auth-service.js';
import {
  addServer,
  removeServer,
  renameServer,
  reportSignInError,
  signIn,
  signOut,
  signUpUrl,
  type ServerCommandDeps,
} from './server-commands.js';
import { createMemento, createSecrets, flush, hiveDiscovery, jsonResponse } from '../__mocks__/test-helpers.js';

const HIVE: ServerEntry = {
  id: 'hive-1',
  kind: 'hive',
  label: 'Team Hive',
  baseUrl: 'https://hive.example.com',
  mcpBaseUrl: 'https://hive.example.com',
  authProviders: ['entra', 'google'],
  origin: 'user',
  addedAt: '2026-01-01T00:00:00.000Z',
};

describe('server commands', () => {
  let registry: ConnectionManager;
  let sessions: SessionManager;
  let deps: ServerCommandDeps;
  let secrets: ReturnType<typeof createSecrets>;

  async function setup(servers: ServerEntry[] = [HIVE], stored: Record<string, object> = {}) {
    secrets = createSecrets(
      Object.fromEntries(Object.entries(stored).map(([id, s]) => [sessionSecretKey(id), JSON.stringify(s)])),
    );
    registry = new ConnectionManager(createMemento({ [SERVERS_STORAGE_KEY]: servers }) as any);
    sessions = new SessionManager(registry, secrets);
    await sessions.initialize();
    deps = { registry, sessions, webAppUrl: 'https://app.aiqbee.com', showEmailSignIn: vi.fn() };
  }

  beforeEach(() => {
    process.env.VITE_API_URL = 'https://api.aiqbee.com';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(hiveDiscovery())));
  });

  afterEach(() => {
    sessions.dispose();
    registry.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('addServer', () => {
    it('runs discovery, adds the server and offers to sign in', async () => {
      await setup([]);
      const info = vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);

      const entry = await addServer(deps, 'hive.example.com');

      expect(entry).toMatchObject({ baseUrl: 'https://hive.example.com', origin: 'user' });
      expect(registry.findByUrl('hive.example.com')).toBeDefined();
      expect(info).toHaveBeenCalledWith('Added hive.example.com.', 'Sign In');
    });

    it('asks for the URL when none is given and does nothing if cancelled', async () => {
      await setup([]);
      const input = vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue(undefined);

      expect(await addServer(deps)).toBeUndefined();
      expect(input).toHaveBeenCalled();
      expect(registry.list()).toHaveLength(1);
    });

    it('reports a duplicate without adding it again', async () => {
      await setup([HIVE]);
      const info = vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);

      const entry = await addServer(deps, 'https://hive.example.com/');

      expect(entry?.id).toBe('hive-1');
      expect(info).toHaveBeenCalledWith(expect.stringContaining('already in your server list'));
      expect(registry.list()).toHaveLength(2);
    });

    it('warns when the server has no supported sign-in method', async () => {
      await setup([]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(hiveDiscovery({ authProviders: ['local'] }))));
      const warn = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

      await addServer(deps, 'hive.example.com');

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no sign-in method the extension supports'));
    });

    it('shows an error when discovery fails', async () => {
      await setup([]);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
      const error = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);

      expect(await addServer(deps, 'hive.example.com')).toBeUndefined();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Could not add Hive Server'));
    });
  });

  describe('removeServer', () => {
    it('asks for confirmation, then removes the server and its stored session', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 't' } });
      const warn = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Remove' as any);

      await removeServer(deps, 'hive-1');
      await flush();

      expect(warn).toHaveBeenCalledWith('Remove Team Hive?', expect.objectContaining({ modal: true }), 'Remove');
      expect(registry.get('hive-1')).toBeUndefined();
      expect(secrets._data.has(sessionSecretKey('hive-1'))).toBe(false);
    });

    it('keeps the server when the user cancels', async () => {
      await setup();
      vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

      await removeServer(deps, { serverId: 'hive-1' });

      expect(registry.get('hive-1')).toBeDefined();
    });

    it('explains that the cloud entry cannot be removed', async () => {
      await setup();
      const info = vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);

      await removeServer(deps, 'cloud');

      expect(info).toHaveBeenCalledWith(expect.stringContaining('cannot be removed'));
      expect(registry.get('cloud')).toBeDefined();
    });
  });

  describe('renameServer', () => {
    it('renames the chosen server', async () => {
      await setup();
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Production');

      await renameServer(deps, { serverId: 'hive-1' });

      expect(registry.get('hive-1')?.label).toBe('Production');
    });
  });

  describe('signIn', () => {
    it('asks which provider to use when the server offers several', async () => {
      await setup();
      const session = sessions.require('hive-1');
      const pick = vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => items[1]);
      const flow = vi.spyOn(session, 'signIn').mockResolvedValue();

      await signIn(deps, 'hive-1');

      expect(pick).toHaveBeenCalled();
      expect(flow).toHaveBeenCalledWith('google');
    });

    it('starts the only provider straight away', async () => {
      await setup([{ ...HIVE, authProviders: ['entra'] }]);
      const pick = vi.spyOn(vscode.window, 'showQuickPick');
      const flow = vi.spyOn(sessions.require('hive-1'), 'signIn').mockResolvedValue();

      await signIn(deps, 'hive-1');

      expect(pick).not.toHaveBeenCalled();
      expect(flow).toHaveBeenCalledWith('entra');
    });

    it('opens the email form in the Account view for email sign-in', async () => {
      await setup([]);
      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) =>
        items.find((i: any) => i.choice === 'email'));

      await signIn(deps, 'cloud');

      expect(deps.showEmailSignIn).toHaveBeenCalledWith('cloud');
    });

    it('asks which server when none is given, offering only signed-out servers', async () => {
      await setup([HIVE], { cloud: { accessToken: 'c' } });
      const flow = vi.spyOn(sessions.require('hive-1'), 'signIn').mockResolvedValue();
      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => items[0]);

      await signIn(deps, undefined);

      expect(flow).toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('signs out of the given server only', async () => {
      await setup([HIVE], { 'hive-1': { accessToken: 'h' }, cloud: { accessToken: 'c' } });

      await signOut(deps, 'hive-1');

      expect(sessions.require('hive-1').status).toBe('signedOut');
      expect(sessions.require('cloud').status).toBe('connected');
    });
  });

  describe('reportSignInError', () => {
    it('ignores a cancelled sign-in', async () => {
      await setup();
      const error = vi.spyOn(vscode.window, 'showErrorMessage');

      await reportSignInError(sessions.require('hive-1'), deps.webAppUrl, new SignInCancelledError());

      expect(error).not.toHaveBeenCalled();
    });

    it('offers the cloud sign-up page when an account is needed', async () => {
      await setup();
      vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Sign Up' as any);
      const open = vi.spyOn(vscode.env, 'openExternal').mockResolvedValue(true);

      await reportSignInError(sessions.require('cloud'), deps.webAppUrl, new AuthStateError('No account', 'SignUpRequired'));

      expect((open.mock.calls[0][0] as any).toString()).toBe('https://app.aiqbee.com/signup');
    });

    it('does not offer cloud sign-up for a Hive Server', async () => {
      await setup();
      const warn = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

      await reportSignInError(sessions.require('hive-1'), deps.webAppUrl, new AuthStateError('No account', 'SignUpRequired'));

      expect(warn).toHaveBeenCalledWith('No account');
    });
  });

  it('signUpUrl points at the web app sign-up page', () => {
    expect(signUpUrl('https://app.aiqbee.com/')).toBe('https://app.aiqbee.com/signup');
  });
});
