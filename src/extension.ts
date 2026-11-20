import * as vscode from 'vscode';
import { ConnectionManager } from './connection/connection.js';
import { migrateLegacyConnection } from './connection/migration.js';
import { readSettingServers, SERVERS_SETTING } from './connection/settings-servers.js';
import { SessionManager } from './connection/session-manager.js';
import type { ServerSession } from './connection/server-session.js';
import type { BrainWithAccessDto } from './api/types.js';
import { SidebarProvider } from './views/sidebar-provider.js';
import { BrainGraphPanel } from './views/brain-graph-panel.js';
import { ServersTreeProvider, SERVERS_VIEW_ID } from './views/servers-tree.js';
import { registerServerCommands } from './commands/server-commands.js';
import { registerBrainCommands } from './commands/brain-commands.js';

const log = vscode.window.createOutputChannel('Aiqbee');

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const webAppUrl = process.env.VITE_APP_URL || 'https://app.aiqbee.com';
  const getEnvironment = () =>
    vscode.workspace.getConfiguration('aiqbee').get<string>('environment', 'production');

  // Move a pre-multi-server install's single connection and tokens into the new layout.
  try {
    await migrateLegacyConnection(context.globalState, context.secrets);
  } catch (err) {
    // Legacy data is kept on failure and migration is retried at the next activation.
    log.appendLine(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const registry = new ConnectionManager(context.globalState);
  const sessions = new SessionManager(registry, context.secrets);
  await sessions.initialize();

  // Servers pre-seeded through the user-level aiqbee.servers setting.
  const syncSettingServers = async () => {
    const settings = readSettingServers(
      vscode.workspace.getConfiguration('aiqbee'),
      (entry, reason) => log.appendLine(`Ignoring aiqbee.servers entry ${JSON.stringify(entry)}: ${reason}`),
    );
    await registry.syncSettingServers(settings).catch((err) =>
      log.appendLine(`aiqbee.servers sync failed: ${err instanceof Error ? err.message : String(err)}`));
  };
  void syncSettingServers();

  // Views
  const tree = new ServersTreeProvider(sessions);
  const treeView = vscode.window.createTreeView(SERVERS_VIEW_ID, {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  const sidebar = new SidebarProvider(context.extensionUri, sessions, webAppUrl, getEnvironment);

  const showServerLabel = () => registry.list().length > 1;
  const openGraph = (session: ServerSession, brain: BrainWithAccessDto) =>
    BrainGraphPanel.createOrShow(context.extensionUri, session, brain, showServerLabel());

  context.subscriptions.push(
    log,
    tree,
    treeView,
    sidebar,
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    sessions.onDidRemoveSession((entry) => BrainGraphPanel.closeForServer(entry.id)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`aiqbee.${SERVERS_SETTING}`)) {
        void syncSettingServers();
      }
    }),
    ...registerServerCommands({
      registry,
      sessions,
      webAppUrl,
      showEmailSignIn: (serverId) => sidebar.showEmailSignIn(serverId),
    }),
    ...registerBrainCommands({ sessions, webAppUrl, openGraph }),
    vscode.commands.registerCommand('aiqbee.openBrainManager', () =>
      vscode.commands.executeCommand(`${SERVERS_VIEW_ID}.focus`)),
    { dispose: () => sessions.dispose() },
    { dispose: () => registry.dispose() },
  );

  // Keep every signed-in session alive; each server refreshes independently.
  sessions.startRefreshTimer();
}

export function deactivate(): void {
  // Disposables registered on the extension context clean everything up.
}
