import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { BrainGraphPanel, graphPanelKey, graphPanelTitle } from './brain-graph-panel.js';
import { ConnectionManager, SERVERS_STORAGE_KEY, type ServerEntry } from '../connection/connection.js';
import { SessionManager } from '../connection/session-manager.js';
import { sessionSecretKey } from '../auth/token-storage.js';
import { createMemento, createSecrets, jsonResponse } from '../__mocks__/test-helpers.js';

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

const BRAIN = { id: 'same-id', name: 'Dev Brain', canWrite: true };

describe('BrainGraphPanel', () => {
  let registry: ConnectionManager;
  let sessions: SessionManager;
  let panels: ReturnType<typeof vscode.window.createWebviewPanel>[];

  beforeEach(async () => {
    process.env.VITE_API_URL = 'https://api.aiqbee.com';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ records: [], totalRecords: 0, page: 1, totalPages: 1 })));
    registry = new ConnectionManager(createMemento({ [SERVERS_STORAGE_KEY]: [HIVE] }) as any);
    sessions = new SessionManager(registry, createSecrets({
      [sessionSecretKey('cloud')]: JSON.stringify({ accessToken: 'c' }),
      [sessionSecretKey('hive-1')]: JSON.stringify({ accessToken: 'h' }),
    }));
    await sessions.initialize();
    panels = [];
    const original = vscode.window.createWebviewPanel;
    vi.spyOn(vscode.window, 'createWebviewPanel').mockImplementation((...args: any[]) => {
      const panel = (original as any)(...args);
      panels.push(panel);
      return panel;
    });
  });

  afterEach(() => {
    panels.forEach((p: any) => p.dispose());
    sessions.dispose();
    registry.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps same-named brains on different servers in separate panels', () => {
    BrainGraphPanel.createOrShow({ fsPath: '/ext', path: '/ext' } as any, sessions.require('cloud'), BRAIN, true);
    BrainGraphPanel.createOrShow({ fsPath: '/ext', path: '/ext' } as any, sessions.require('hive-1'), BRAIN, true);

    expect(panels).toHaveLength(2);
    expect(panels.map((p: any) => p.title)).toEqual([
      'Brain Graph: Dev Brain — Aiqbee Cloud',
      'Brain Graph: Dev Brain — Team Hive',
    ]);
  });

  it('reveals the existing panel for the same server and brain', () => {
    const session = sessions.require('hive-1');
    BrainGraphPanel.createOrShow({ fsPath: '/ext', path: '/ext' } as any, session, BRAIN, false);
    BrainGraphPanel.createOrShow({ fsPath: '/ext', path: '/ext' } as any, session, BRAIN, false);

    expect(panels).toHaveLength(1);
    expect((panels[0] as any).revealed).toBe(1);
  });

  it('closes only the panels of a removed server', () => {
    BrainGraphPanel.createOrShow({ fsPath: '/ext', path: '/ext' } as any, sessions.require('cloud'), BRAIN, true);
    BrainGraphPanel.createOrShow({ fsPath: '/ext', path: '/ext' } as any, sessions.require('hive-1'), BRAIN, true);

    BrainGraphPanel.closeForServer('hive-1');

    expect((panels[0] as any).disposed).toBe(false);
    expect((panels[1] as any).disposed).toBe(true);
  });

  it('makes the graph read-only when its server signs out', async () => {
    const session = sessions.require('hive-1');
    BrainGraphPanel.createOrShow({ fsPath: '/ext', path: '/ext' } as any, session, BRAIN, false);
    const panel: any = panels[0];

    await session.signOut();

    expect(panel.posted).toContainEqual(expect.objectContaining({ type: 'sessionEnded' }));
  });

  it('refuses to save a neuron while its server is signed out', async () => {
    const session = sessions.require('hive-1');
    BrainGraphPanel.createOrShow({ fsPath: '/ext', path: '/ext' } as any, session, BRAIN, false);
    const panel: any = panels[0];
    await session.signOut();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();

    await panel.webview.receive({ type: 'saveNeuron', neuronId: 'n1', name: 'N', content: 'C', neuronTypeId: 't' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(panel.posted).toContainEqual(expect.objectContaining({ type: 'saveError', neuronId: 'n1' }));
  });

  it('builds keys and titles from server and brain', () => {
    expect(graphPanelKey('hive-1', 'b')).toBe('hive-1:b');
    expect(graphPanelTitle('Dev', 'Team Hive', false)).toBe('Brain Graph: Dev');
  });
});
