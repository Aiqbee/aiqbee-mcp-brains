import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SidebarProvider } from './sidebar-provider.js';
import { ApiRequestError } from '../api/api-client.js';
import type { AuthService } from '../auth/auth-service.js';
import type { BrainService } from '../api/brain-service.js';
import type { NeuronService } from '../api/neuron-service.js';
import type { ConnectionManager } from '../connection/connection.js';
import * as vscode from 'vscode';

function createMockAuthService(): AuthService {
  const emitter = new vscode.EventEmitter();
  return {
    onAuthStateChanged: emitter.event,
    initialize: vi.fn().mockResolvedValue({ authenticated: true, user: { id: '1', givenName: 'Test', familyName: 'User', email: 'test@example.com' } }),
    signInWithMicrosoft: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    handleGoogleCallback: vi.fn(),
    register: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
    getEnvironment: vi.fn().mockReturnValue('development'),
    dispose: vi.fn(),
  } as unknown as AuthService;
}

function createMockConnectionManager(): ConnectionManager {
  return {
    getConnection: vi.fn().mockReturnValue({
      backendType: 'cloud',
      baseUrl: 'https://api.aiqbee.com',
      mcpBaseUrl: 'https://mcp.aiqbee.com',
      authProviders: ['entra', 'google', 'email'],
      label: 'Aiqbee Cloud',
    }),
    isHive: vi.fn().mockReturnValue(false),
    connectToHive: vi.fn(),
    connectToCloud: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
  } as unknown as ConnectionManager;
}

function createMockBrainService(): BrainService {
  return {
    listBrains: vi.fn().mockResolvedValue([]),
    createBrain: vi.fn(),
    getBrainTemplates: vi.fn().mockResolvedValue([]),
  } as unknown as BrainService;
}

function createMockNeuronService(): NeuronService {
  return {
    getBrainCounts: vi.fn(),
  } as unknown as NeuronService;
}

/**
 * Access the private handleMessage method for testing.
 * The SidebarProvider processes webview messages through this handler.
 */
function getMessageHandler(provider: SidebarProvider): (message: any) => Promise<void> {
  return (provider as any).handleMessage.bind(provider);
}

describe('SidebarProvider', () => {
  let authService: AuthService;
  let connectionManager: ConnectionManager;
  let brainService: BrainService;
  let neuronService: NeuronService;
  let provider: SidebarProvider;
  let postedMessages: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    authService = createMockAuthService();
    connectionManager = createMockConnectionManager();
    brainService = createMockBrainService();
    neuronService = createMockNeuronService();

    provider = new SidebarProvider(
      vscode.Uri.file('/test') as any,
      connectionManager,
      authService,
      brainService,
      neuronService,
      vi.fn(),
    );

    // Capture posted messages by mocking the private view
    postedMessages = [];
    (provider as any).view = {
      webview: {
        postMessage: (msg: any) => postedMessages.push(msg),
      },
    };
  });

  describe('401 auto-signout', () => {
    it('signs out and redirects to login when API returns 401', async () => {
      (brainService.listBrains as any).mockRejectedValue(
        new ApiRequestError('Authentication expired. Please sign in again.', 401),
      );

      const handler = getMessageHandler(provider);
      await handler({ command: 'listBrains' });

      expect(authService.signOut).toHaveBeenCalledOnce();
      // Should NOT send a generic error message — signOut fires authStateChanged
      const errorMessages = postedMessages.filter((m) => m.command === 'error');
      expect(errorMessages).toHaveLength(0);
    });

    it('sends error message for non-401 API errors', async () => {
      (brainService.listBrains as any).mockRejectedValue(
        new ApiRequestError('Server error', 500, 'Internal Server Error'),
      );

      const handler = getMessageHandler(provider);
      await handler({ command: 'listBrains' });

      expect(authService.signOut).not.toHaveBeenCalled();
      const errorMessages = postedMessages.filter((m) => m.command === 'error');
      expect(errorMessages).toHaveLength(1);
      expect(errorMessages[0].payload.message).toBe('Server error');
    });

    it('sends error message for non-ApiRequestError exceptions', async () => {
      (brainService.listBrains as any).mockRejectedValue(
        new Error('Network timeout'),
      );

      const handler = getMessageHandler(provider);
      await handler({ command: 'listBrains' });

      expect(authService.signOut).not.toHaveBeenCalled();
      const errorMessages = postedMessages.filter((m) => m.command === 'error');
      expect(errorMessages).toHaveLength(1);
      expect(errorMessages[0].payload.message).toBe('Network timeout');
    });
  });

  describe('ready / getAuthState', () => {
    it('sends authStateChanged and connectionChanged on ready', async () => {
      const handler = getMessageHandler(provider);
      await handler({ command: 'ready' });

      expect(authService.initialize).toHaveBeenCalledOnce();
      const authMsg = postedMessages.find((m) => m.command === 'authStateChanged');
      const connMsg = postedMessages.find((m) => m.command === 'connectionChanged');
      expect(authMsg).toBeDefined();
      expect(connMsg).toBeDefined();
      expect(connMsg.payload.backendType).toBe('cloud');
    });
  });

  describe('hive connection', () => {
    it('connects to hive and sends connectionChanged', async () => {
      const hiveConn = {
        backendType: 'hive' as const,
        baseUrl: 'https://hive.company.com',
        mcpBaseUrl: 'https://hive.company.com',
        authProviders: ['entra'],
        label: 'hive.company.com',
      };
      (connectionManager.connectToHive as any).mockResolvedValue(hiveConn);

      const handler = getMessageHandler(provider);
      await handler({ command: 'connectToHive', payload: { url: 'https://hive.company.com' } });

      expect(connectionManager.connectToHive).toHaveBeenCalledWith('https://hive.company.com');
      expect(authService.signOut).toHaveBeenCalledOnce();
      const connMsg = postedMessages.find((m) => m.command === 'connectionChanged');
      expect(connMsg.payload.backendType).toBe('hive');
      expect(connMsg.payload.label).toBe('hive.company.com');
    });

    it('disconnects from hive and switches to cloud', async () => {
      const cloudConn = {
        backendType: 'cloud' as const,
        baseUrl: 'https://api.aiqbee.com',
        mcpBaseUrl: 'https://mcp.aiqbee.com',
        authProviders: ['entra', 'google', 'email'],
        label: 'Aiqbee Cloud',
      };
      (connectionManager.getConnection as any).mockReturnValue(cloudConn);

      const handler = getMessageHandler(provider);
      await handler({ command: 'disconnectHive' });

      expect(connectionManager.connectToCloud).toHaveBeenCalledOnce();
      expect(authService.signOut).toHaveBeenCalledOnce();
      const connMsg = postedMessages.find((m) => m.command === 'connectionChanged');
      expect(connMsg.payload.backendType).toBe('cloud');
    });
  });
});
