import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ConnectionManager } from '../connection/connection.js';
import { AuthService, AuthStateError, SignInCancelledError } from '../auth/auth-service.js';
import { BrainService } from '../api/brain-service.js';
import { NeuronService } from '../api/neuron-service.js';
import { addMcpConnection } from '../mcp/mcp-config.js';
import { ApiRequestError } from '../api/api-client.js';
import type { WebviewMessage } from '../api/types.js';

const log = vscode.window.createOutputChannel('Aiqbee Sidebar');

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiqbee.brainManagerView';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connectionManager: ConnectionManager,
    private readonly authService: AuthService,
    private readonly brainService: BrainService,
    private readonly neuronService: NeuronService,
    private readonly openGraph: (brainId: string, brainName: string, canWrite: boolean) => void,
  ) {
    // Forward auth state changes to webview and clear any pending loading state
    this.authService.onAuthStateChanged((state) => {
      this.postMessage({ command: 'authStateChanged', payload: state });
      this.postMessage({ command: 'loading', payload: { loading: false, command: 'signIn' } });
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
    );
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    try {
      switch (message.command) {
        case 'ready':
        case 'getAuthState': {
          const state = await this.authService.initialize();
          this.postMessage({ command: 'authStateChanged', payload: state });
          const currentConn = this.connectionManager.getConnection();
          this.postMessage({
            command: 'connectionChanged',
            payload: {
              backendType: currentConn.backendType,
              label: currentConn.label,
              authProviders: currentConn.authProviders,
            },
          });
          break;
        }

        case 'signInMicrosoft': {
          this.postMessage({ command: 'loading', payload: { loading: true, command: 'signIn' } });
          await this.authService.signInWithMicrosoft();
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'signIn' } });
          break;
        }

        case 'signInGoogle': {
          this.postMessage({ command: 'loading', payload: { loading: true, command: 'signIn' } });
          await this.authService.signInWithGoogle();
          // loading cleared by authStateChanged listener on callback success,
          // or by catch block on error. Don't clear here — signInWithGoogle
          // returns immediately after opening the browser.
          break;
        }

        case 'signInEmail': {
          this.postMessage({ command: 'loading', payload: { loading: true, command: 'signIn' } });
          await this.authService.signInWithEmail(message.payload);
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'signIn' } });
          break;
        }

        case 'register': {
          this.postMessage({ command: 'loading', payload: { loading: true, command: 'register' } });
          const regResult = await this.authService.register(message.payload);
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'register' } });
          if (regResult.emailVerificationRequired) {
            this.postMessage({ command: 'emailVerificationRequired', payload: { email: message.payload.email } });
          }
          break;
        }

        case 'signOut': {
          await this.authService.signOut();
          break;
        }

        case 'listBrains': {
          this.postMessage({ command: 'loading', payload: { loading: true, command: 'listBrains' } });
          log.appendLine('Fetching brains...');
          const brains = await this.brainService.listBrains();
          log.appendLine(`Got ${Array.isArray(brains) ? brains.length : typeof brains} brains`);
          this.postMessage({ command: 'brainsLoaded', payload: brains });
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'listBrains' } });
          break;
        }

        case 'createBrain': {
          this.postMessage({ command: 'loading', payload: { loading: true, command: 'createBrain' } });
          const brain = await this.brainService.createBrain(message.payload);
          this.postMessage({ command: 'brainCreated', payload: brain });
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'createBrain' } });
          break;
        }

        case 'getBrainCounts': {
          const counts = await this.neuronService.getBrainCounts(message.payload.brainId);
          this.postMessage({
            command: 'brainCounts',
            payload: { brainId: message.payload.brainId, counts },
          });
          break;
        }

        case 'getBrainTemplates': {
          const templates = await this.brainService.getBrainTemplates();
          this.postMessage({ command: 'brainTemplatesLoaded', payload: templates });
          break;
        }

        case 'connectToHive': {
          this.postMessage({ command: 'loading', payload: { loading: true, command: 'connectToHive' } });
          const conn = await this.connectionManager.connectToHive(message.payload.url);
          await this.authService.signOut();
          this.postMessage({
            command: 'connectionChanged',
            payload: {
              backendType: conn.backendType,
              label: conn.label,
              authProviders: conn.authProviders,
            },
          });
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'connectToHive' } });
          break;
        }

        case 'disconnectHive': {
          await this.connectionManager.connectToCloud();
          await this.authService.signOut();
          const cloudConn = this.connectionManager.getConnection();
          this.postMessage({
            command: 'connectionChanged',
            payload: {
              backendType: cloudConn.backendType,
              label: cloudConn.label,
              authProviders: cloudConn.authProviders,
            },
          });
          break;
        }

        case 'addMcpConnection': {
          const mcpBaseUrl = this.connectionManager.getConnection().mcpBaseUrl;
          await addMcpConnection(message.payload.brainId, message.payload.brainName, mcpBaseUrl);
          break;
        }

        case 'openBrainGraph': {
          this.openGraph(message.payload.brainId, message.payload.brainName, message.payload.canWrite);
          break;
        }

        case 'cancelSignIn': {
          this.authService.cancelSignIn();
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'signIn' } });
          break;
        }

        case 'openExternal': {
          vscode.env.openExternal(vscode.Uri.parse(message.payload.url));
          break;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // User-initiated cancellation — loading already cleared by cancelSignIn handler
      if (err instanceof SignInCancelledError) {
        return;
      }

      // If the API returned 401 after refresh failed, sign out so the
      // webview redirects to the login page instead of showing an error.
      if (err instanceof ApiRequestError && err.status === 401) {
        log.appendLine('Session expired — signing out');
        await this.authService.signOut();
        return;
      }

      // Auth state errors (SignUpRequired, PendingApproval) — send actionable message
      if (err instanceof AuthStateError) {
        const webAppUrl = this.getWebAppUrl();
        this.postMessage({
          command: 'authActionRequired',
          payload: { state: err.state, message: errorMessage, webAppUrl },
        });
        this.postMessage({ command: 'loading', payload: { loading: false, command: message.command } });
        return;
      }

      // Subscription/license limit errors — parse structured error from backend
      if (err instanceof ApiRequestError && err.status === 400) {
        const limitError = this.parseSubscriptionLimitError(err);
        if (limitError) {
          this.postMessage({
            command: 'subscriptionLimitReached',
            payload: limitError,
          });
          this.postMessage({ command: 'loading', payload: { loading: false, command: message.command } });
          return;
        }
      }

      this.postMessage({
        command: 'error',
        payload: { message: errorMessage, command: message.command },
      });
      this.postMessage({
        command: 'loading',
        payload: { loading: false, command: message.command },
      });
    }
  }

  /** Web app URL from build-time env config (VITE_APP_URL) */
  private getWebAppUrl(): string {
    return process.env.VITE_APP_URL || 'https://app.aiqbee.com';
  }

  /** Parse a structured subscription limit error from the API response body */
  private parseSubscriptionLimitError(err: ApiRequestError): {
    errorCode: string;
    message: string;
    currentCount: number;
    maxAllowed: number;
    isHive: boolean;
  } | null {
    if (!err.body) { return null; }
    try {
      const body = typeof err.body === 'string' ? JSON.parse(err.body) : err.body;
      if (body.errorCode && typeof body.currentCount === 'number' && typeof body.maxAllowed === 'number') {
        return {
          errorCode: body.errorCode,
          message: body.message || err.message,
          currentCount: body.currentCount,
          maxAllowed: body.maxAllowed,
          isHive: this.connectionManager.isHive(),
        };
      }
    } catch { /* not a structured error */ }
    return null;
  }

  private postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = path.join(this.extensionUri.fsPath, 'dist', 'webview');

    const jsFile = this.findFile(distPath, 'assets', '.js');
    const cssFile = this.findFile(distPath, 'assets', '.css');

    const jsUri = jsFile
      ? webview.asWebviewUri(vscode.Uri.file(jsFile))
      : '';
    const cssUri = cssFile
      ? webview.asWebviewUri(vscode.Uri.file(cssFile))
      : '';

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  ${cssUri ? `<link rel="stylesheet" href="${cssUri}">` : ''}
  <title>Aiqbee Brain Manager</title>
</head>
<body>
  <div id="root"></div>
  ${jsUri ? `<script nonce="${nonce}" type="module" src="${jsUri}"></script>` : '<p>Build the webview first: cd webview-ui && npm run build</p>'}
</body>
</html>`;
  }

  private findFile(basePath: string, subDir: string, extension: string): string | undefined {
    const dirPath = path.join(basePath, subDir);
    try {
      const files = fs.readdirSync(dirPath);
      const match = files.find((f) => f.endsWith(extension));
      return match ? path.join(dirPath, match) : undefined;
    } catch {
      return undefined;
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
