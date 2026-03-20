import * as vscode from 'vscode';
import { TokenStorage } from './auth/token-storage.js';
import { AuthService } from './auth/auth-service.js';
import { ApiClient } from './api/api-client.js';
import { BrainService } from './api/brain-service.js';
import { NeuronService } from './api/neuron-service.js';
import { SidebarProvider } from './views/sidebar-provider.js';

export function activate(context: vscode.ExtensionContext): void {
  // Core services
  const tokenStorage = new TokenStorage(context.secrets);
  const apiClient = new ApiClient(tokenStorage);
  const authService = new AuthService(tokenStorage, apiClient);
  const brainService = new BrainService(apiClient);
  const neuronService = new NeuronService(apiClient);

  // Wire token refresh
  apiClient.setRefreshHandler(() => authService.refreshToken());

  // Register sidebar webview provider
  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    authService,
    brainService,
    neuronService,
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

  // Cleanup
  context.subscriptions.push({
    dispose: () => authService.dispose(),
  });
}

export function deactivate(): void {
  // Nothing to clean up
}
