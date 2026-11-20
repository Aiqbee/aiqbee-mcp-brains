import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AuthStateError, SignInCancelledError } from '../auth/auth-service.js';
import type { SessionManager } from '../connection/session-manager.js';
import type { ServerSession } from '../connection/server-session.js';
import type { ExtensionMessage, ServerViewModel, WebviewMessage } from '../api/types.js';
import { signUpUrl } from '../commands/server-commands.js';

/**
 * The Account & Help webview: one card per server with its sign-in state and
 * sign-in form, plus the Help and Prompts tabs. Brains live in the native tree.
 */
export class SidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'aiqbee.brainManagerView';
  private view?: vscode.WebviewView;
  private ready = false;
  private pendingEmailServerId: string | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessions: SessionManager,
    private readonly webAppUrl: string,
    private readonly getEnvironment: () => string,
  ) {
    this.disposables.push(sessions.onDidChange(() => this.postServers()));
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this.ready = false;

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
    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.ready = false;
    });
  }

  /** Reveal the view and open the email sign-in form for a server. */
  showEmailSignIn(serverId: string): void {
    this.pendingEmailServerId = serverId;
    void vscode.commands.executeCommand(`${SidebarProvider.viewType}.focus`);
    this.flushPendingEmail();
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    const serverId = 'payload' in message && message.payload && 'serverId' in message.payload
      ? message.payload.serverId
      : undefined;
    try {
      switch (message.command) {
        case 'ready':
          this.ready = true;
          this.postServers();
          this.flushPendingEmail();
          break;

        case 'signIn': {
          const session = this.sessions.require(message.payload.serverId);
          await this.runSignIn(session, () => session.signIn(message.payload.provider));
          break;
        }

        case 'signInEmail': {
          const { serverId: id, email, password } = message.payload;
          const session = this.sessions.require(id);
          await this.runSignIn(session, () => session.signInWithEmail({ email, password }));
          break;
        }

        case 'cancelSignIn':
          this.sessions.require(message.payload.serverId).cancelSignIn();
          break;

        case 'signOut':
          await this.sessions.require(message.payload.serverId).signOut();
          break;

        case 'addServer':
          await vscode.commands.executeCommand('aiqbee.addServer', message.payload.url);
          break;

        case 'removeServer':
          await vscode.commands.executeCommand('aiqbee.removeServer', message.payload.serverId);
          break;

        case 'openExternal':
          await openExternalSafely(message.payload.url);
          break;
      }
    } catch (err) {
      this.postMessage({
        command: 'error',
        payload: { message: err instanceof Error ? err.message : String(err), serverId },
      });
    }
  }

  private async runSignIn(session: ServerSession, flow: () => Promise<void>): Promise<void> {
    try {
      await flow();
    } catch (err) {
      if (err instanceof SignInCancelledError) {
        return;
      }
      if (err instanceof AuthStateError) {
        this.postMessage({
          command: 'authActionRequired',
          payload: {
            serverId: session.serverId,
            state: err.state,
            message: err.message,
            // Only cloud accounts sign up through the Aiqbee web app; Hive
            // accounts are managed by the organisation's own administrator.
            signUpUrl: session.entry.kind === 'cloud' ? signUpUrl(this.webAppUrl) : undefined,
          },
        });
        return;
      }
      throw err;
    }
  }

  private postServers(): void {
    if (!this.ready) {
      return;
    }
    const servers: ServerViewModel[] = this.sessions.all().map((s) => toViewModel(s, this.webAppUrl));
    this.postMessage({ command: 'serversChanged', payload: { servers, environment: this.getEnvironment() } });
  }

  private flushPendingEmail(): void {
    if (this.ready && this.pendingEmailServerId) {
      this.postMessage({ command: 'showEmailSignIn', payload: { serverId: this.pendingEmailServerId } });
      this.pendingEmailServerId = undefined;
    }
  }

  private postMessage(message: ExtensionMessage): void {
    void this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = path.join(this.extensionUri.fsPath, 'dist', 'webview');

    const jsFile = findFile(distPath, 'assets', '.js');
    const cssFile = findFile(distPath, 'assets', '.css');

    const jsUri = jsFile ? webview.asWebviewUri(vscode.Uri.file(jsFile)) : '';
    const cssUri = cssFile ? webview.asWebviewUri(vscode.Uri.file(cssFile)) : '';

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  ${cssUri ? `<link rel="stylesheet" href="${cssUri}">` : ''}
  <title>Aiqbee</title>
</head>
<body>
  <div id="root"></div>
  ${jsUri ? `<script nonce="${nonce}" type="module" src="${jsUri}"></script>` : '<p>Build the webview first: cd webview-ui && npm run build</p>'}
</body>
</html>`;
  }
}

export function toViewModel(session: ServerSession, webAppUrl: string): ServerViewModel {
  const entry = session.entry;
  return {
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    baseUrl: entry.baseUrl,
    status: session.status,
    statusMessage: session.statusMessage,
    user: session.user
      ? { givenName: session.user.givenName, familyName: session.user.familyName, email: session.user.email }
      : undefined,
    authProviders: entry.authProviders,
    removable: entry.origin === 'user',
    managed: entry.origin === 'setting',
    signUpUrl: entry.kind === 'cloud' ? signUpUrl(webAppUrl) : undefined,
  };
}

/** Only open web links from the webview; never file:, command: or other schemes. */
async function openExternalSafely(url: string): Promise<void> {
  const uri = vscode.Uri.parse(url);
  if (uri.scheme !== 'https' && uri.scheme !== 'http') {
    throw new Error('Only web links can be opened.');
  }
  await vscode.env.openExternal(uri);
}

function findFile(basePath: string, subDir: string, extension: string): string | undefined {
  const dirPath = path.join(basePath, subDir);
  try {
    const match = fs.readdirSync(dirPath).find((f) => f.endsWith(extension));
    return match ? path.join(dirPath, match) : undefined;
  } catch {
    return undefined;
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
