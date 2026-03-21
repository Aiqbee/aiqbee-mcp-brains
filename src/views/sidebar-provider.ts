import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AuthService } from '../auth/auth-service.js';
import { BrainService } from '../api/brain-service.js';
import { NeuronService } from '../api/neuron-service.js';
import { addMcpConnection } from '../mcp/mcp-config.js';
import type { WebviewMessage } from '../api/types.js';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiqbee.brainManagerView';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly authService: AuthService,
    private readonly brainService: BrainService,
    private readonly neuronService: NeuronService,
    private readonly openGraph: (brainId: string, brainName: string, canWrite: boolean) => void,
  ) {
    // Forward auth state changes to webview
    this.authService.onAuthStateChanged((state) => {
      this.postMessage({ command: 'authStateChanged', payload: state });
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
          break;
        }

        case 'signInMicrosoft': {
          this.postMessage({ command: 'loading', payload: { loading: true, command: 'signIn' } });
          await this.authService.signInWithMicrosoft();
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'signIn' } });
          break;
        }

        case 'signInGoogle': {
          await this.authService.signInWithGoogle();
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
          await this.authService.register(message.payload);
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'register' } });
          break;
        }

        case 'signOut': {
          await this.authService.signOut();
          break;
        }

        case 'listBrains': {
          this.postMessage({ command: 'loading', payload: { loading: true, command: 'listBrains' } });
          const brains = await this.brainService.listBrains();
          this.postMessage({ command: 'brainsLoaded', payload: brains });
          this.postMessage({ command: 'loading', payload: { loading: false, command: 'listBrains' } });

          // Fetch counts for all brains in parallel
          const countPromises = brains.map(async (brain) => {
            try {
              const counts = await this.neuronService.getBrainCounts(brain.id);
              this.postMessage({
                command: 'brainCounts',
                payload: { brainId: brain.id, counts },
              });
            } catch {
              // Silently skip count errors for individual brains
            }
          });
          await Promise.all(countPromises);
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

        case 'addMcpConnection': {
          await addMcpConnection(message.payload.brainId, message.payload.brainName);
          break;
        }

        case 'openBrainGraph': {
          this.openGraph(message.payload.brainId, message.payload.brainName, message.payload.canWrite);
          break;
        }

        case 'openExternal': {
          vscode.env.openExternal(vscode.Uri.parse(message.payload.url));
          break;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
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
