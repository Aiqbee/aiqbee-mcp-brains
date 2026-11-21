import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { ConnectionManager, SERVERS_STORAGE_KEY, type ServerEntry } from '../connection/connection.js';
import { SessionManager } from '../connection/session-manager.js';
import { sessionSecretKey } from '../auth/token-storage.js';
import { ApiRequestError } from '../api/api-client.js';
import {
  addMcpConnectionCommand,
  createBrain,
  openBrainGraph,
  parseSubscriptionLimitError,
  type BrainCommandDeps,
} from './brain-commands.js';
import { createMemento, createSecrets, jsonResponse } from '../__mocks__/test-helpers.js';

const addMcpConnection = vi.fn();
vi.mock('../mcp/mcp-config.js', () => ({
  addMcpConnection: (...args: unknown[]) => addMcpConnection(...args),
}));

const HIVE: ServerEntry = {
  id: 'hive-1',
  kind: 'hive',
  label: 'Team Hive',
  baseUrl: 'https://hive.example.com',
  mcpBaseUrl: 'https://mcp.hive.example.com',
  authProviders: ['entra'],
  origin: 'user',
  addedAt: '2026-01-01T00:00:00.000Z',
};

const BRAIN = { id: 'b1', name: 'Alpha', isPersonal: true, allowMCPEditing: true, accessLevel: 2, canWrite: true, canManageAccess: true };

describe('brain commands', () => {
  let registry: ConnectionManager;
  let sessions: SessionManager;
  let deps: BrainCommandDeps;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    process.env.VITE_API_URL = 'https://api.aiqbee.com';
    addMcpConnection.mockReset();
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/brains/with-access')) { return jsonResponse([BRAIN]); }
      if (url.endsWith('/api/brain-templates')) {
        return jsonResponse([{ id: 't1', name: 'Dev', isStandard: true, isDefault: true }]);
      }
      if (url.endsWith('/api/brains') && init?.method === 'POST') {
        return jsonResponse({ id: 'b1', name: 'Alpha', isPersonal: true, isDefault: false, allowMCPEditing: true });
      }
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);
    registry = new ConnectionManager(createMemento({ [SERVERS_STORAGE_KEY]: [HIVE] }) as any);
    sessions = new SessionManager(registry, createSecrets({ [sessionSecretKey('hive-1')]: JSON.stringify({ accessToken: 't' }) }));
    await sessions.initialize();
    deps = { sessions, webAppUrl: 'https://app.aiqbee.com', openGraph: vi.fn() };
  });

  afterEach(() => {
    sessions.dispose();
    registry.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('createBrain', () => {
    it('creates a brain on the chosen server with the selected template and reloads the list', async () => {
      vi.spyOn(vscode.window, 'showInputBox')
        .mockResolvedValueOnce('  Alpha  ')
        .mockResolvedValueOnce('');
      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => items[0]);
      vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);

      await createBrain(deps, 'hive-1');

      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
      expect(post[0]).toBe('https://hive.example.com/api/brains');
      expect(JSON.parse(post[1].body)).toMatchObject({ name: 'Alpha', brainTemplateId: 't1' });
      expect(sessions.require('hive-1').brains).toEqual([BRAIN]);
    });

    it('stops when the name prompt is cancelled', async () => {
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue(undefined);

      await createBrain(deps, 'hive-1');

      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    });

    it('explains a plan limit with the licence message on a Hive Server', async () => {
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return jsonResponse({ errorCode: 'BRAIN_LIMIT', message: 'Brain limit reached', currentCount: 3, maxAllowed: 3 }, 400);
        }
        return jsonResponse([]);
      });
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValueOnce('New').mockResolvedValueOnce('');
      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => items[items.length - 1]);
      const warn = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

      await createBrain(deps, 'hive-1');

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('3 of 3 brains used'));
      expect(warn.mock.calls[0][0]).toContain('Hive Server licence');
    });

    async function createExpectingError(postResponse: Response): Promise<string> {
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
        init?.method === 'POST' ? postResponse : jsonResponse([]));
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValueOnce('New').mockResolvedValueOnce('');
      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => items[items.length - 1]);
      const error = vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
      await createBrain(deps, 'hive-1');
      expect(error).toHaveBeenCalledTimes(1);
      return error.mock.calls[0][0] as string;
    }

    it('explains a Hive Server that refuses the create outright (CSRF 403 page)', async () => {
      const message = await createExpectingError(new Response('<h1>403 Forbidden</h1>', {
        status: 403, statusText: 'Forbidden', headers: { 'content-type': 'text/html' },
      }));
      expect(message).toBe('Team Hive refused to create the brain (403 Forbidden). '
        + 'This Hive Server may need updating to support creating brains from VS Code.');
    });

    it("shows a Hive Server's own reason for a 403", async () => {
      const message = await createExpectingError(jsonResponse({ detail: 'Brain limit reached for this licence' }, 403));
      expect(message).toBe('Team Hive refused to create the brain: Brain limit reached for this licence');
    });

    it('still offers a signed-in server that is failing, so the create explains why instead of vanishing', async () => {
      const session = sessions.require('hive-1');
      fetchMock.mockImplementation(async () => { throw new TypeError('fetch failed'); });
      await session.loadBrains().catch(() => undefined);
      expect(session.status).toBe('offline');
      const input = vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue(undefined);

      await createBrain(deps, undefined);

      expect(input).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Brain on Team Hive (1/3)' }));
    });

    it('offers to sign in when no server is signed in', async () => {
      await sessions.require('hive-1').signOut();
      const warn = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Sign In' as any);
      const exec = vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);

      await createBrain(deps, undefined);

      expect(warn).toHaveBeenCalledWith('Sign in to a server to create a brain.', 'Sign In');
      expect(exec).toHaveBeenCalledWith('aiqbee.signIn');
    });
  });

  describe('parseSubscriptionLimitError', () => {
    it('reads the structured body and ignores other errors', () => {
      const body = JSON.stringify({ errorCode: 'X', message: 'Limit', currentCount: 1, maxAllowed: 1 });
      expect(parseSubscriptionLimitError(new ApiRequestError('Bad', 400, body))).toEqual({
        errorCode: 'X', message: 'Limit', currentCount: 1, maxAllowed: 1,
      });
      expect(parseSubscriptionLimitError(new ApiRequestError('Bad', 400, 'not json'))).toBeNull();
      expect(parseSubscriptionLimitError(new ApiRequestError('Bad', 500, body))).toBeNull();
      expect(parseSubscriptionLimitError(new Error('x'))).toBeNull();
    });
  });

  describe('addMcpConnectionCommand', () => {
    it("uses the brain's own server MCP URL", async () => {
      await addMcpConnectionCommand(deps, { type: 'brain', serverId: 'hive-1', brain: BRAIN });

      expect(addMcpConnection).toHaveBeenCalledWith('b1', 'Alpha', 'https://mcp.hive.example.com');
    });

    it('asks for a brain when run from the palette', async () => {
      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => items[0]);

      await addMcpConnectionCommand(deps, undefined);

      expect(addMcpConnection).toHaveBeenCalledWith('b1', 'Alpha', 'https://mcp.hive.example.com');
    });
  });

  describe('openBrainGraph', () => {
    it('opens the graph with the session that owns the brain', async () => {
      await openBrainGraph(deps, { type: 'brain', serverId: 'hive-1', brain: BRAIN });

      expect(deps.openGraph).toHaveBeenCalledWith(sessions.require('hive-1'), BRAIN);
    });
  });
});
