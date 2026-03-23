import * as vscode from 'vscode';
import { ConnectionManager } from './connection/connection.js';
import { TokenStorage } from './auth/token-storage.js';
import { AuthService } from './auth/auth-service.js';
import { ApiClient } from './api/api-client.js';
import { BrainService } from './api/brain-service.js';
import { NeuronService } from './api/neuron-service.js';
import { SidebarProvider } from './views/sidebar-provider.js';
import { BrainGraphPanel } from './views/brain-graph-panel.js';

export function activate(context: vscode.ExtensionContext): void {
  // Core services
  const connectionManager = new ConnectionManager(context.globalState);
  const tokenStorage = new TokenStorage(context.secrets);
  const apiClient = new ApiClient(tokenStorage, connectionManager);
  const authService = new AuthService(tokenStorage, apiClient, connectionManager);
  const brainService = new BrainService(apiClient);
  const neuronService = new NeuronService(apiClient);

  // Wire token refresh
  apiClient.setRefreshHandler(() => authService.refreshToken());

  // Register sidebar webview provider
  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    connectionManager,
    authService,
    brainService,
    neuronService,
    (brainId: string, brainName: string, canWrite: boolean) => {
      BrainGraphPanel.createOrShow(context.extensionUri, neuronService, brainId, brainName, canWrite);
    },
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Google OAuth URI handler
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri): void {
        if (uri.path === '/oauth/callback') {
          const fragment = uri.fragment;
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          if (accessToken) {
            authService.handleGoogleCallback(accessToken).catch((err) => {
              vscode.window.showErrorMessage(`Google sign-in failed: ${err instanceof Error ? err.message : String(err)}`);
            });
          }
        }
      },
    }),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('aiqbee.openBrainManager', () => {
      vscode.commands.executeCommand('aiqbee.brainManagerView.focus');
    }),

    vscode.commands.registerCommand('aiqbee.signIn', () => {
      authService.signInWithMicrosoft().catch((err) => {
        vscode.window.showErrorMessage(`Sign in failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }),

    vscode.commands.registerCommand('aiqbee.signOut', () => {
      authService.signOut();
    }),

    vscode.commands.registerCommand('aiqbee.refresh', () => {
      vscode.commands.executeCommand('aiqbee.brainManagerView.focus');
    }),
  );

  // Proactive token refresh — run every 15 minutes to keep the session alive
  const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
  let refreshInProgress = false;
  const refreshTimer = setInterval(async () => {
    if (refreshInProgress) { return; }
    refreshInProgress = true;
    try {
      const state = await authService.initialize();
      if (state.authenticated) {
        await authService.refreshToken();
      }
    } catch {
      // Refresh failed silently — the next API call will trigger 401 handling
    } finally {
      refreshInProgress = false;
    }
  }, REFRESH_INTERVAL_MS);

  // Cleanup
  context.subscriptions.push({
    dispose: () => {
      clearInterval(refreshTimer);
      authService.dispose();
      connectionManager.dispose();
    },
  });
}

export function deactivate(): void {
  // Nothing to clean up
}
