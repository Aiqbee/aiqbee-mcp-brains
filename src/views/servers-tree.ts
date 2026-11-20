import * as vscode from 'vscode';
import { BrainAccessLevel, type BrainCounts, type BrainWithAccessDto } from '../api/types.js';
import type { SessionManager } from '../connection/session-manager.js';
import type { ServerSession, ServerStatus } from '../connection/server-session.js';

export const SERVERS_VIEW_ID = 'aiqbee.serversView';

export interface ServerNode {
  type: 'server';
  serverId: string;
}

export interface BrainNode {
  type: 'brain';
  serverId: string;
  brain: BrainWithAccessDto;
}

export interface PlaceholderNode {
  type: 'placeholder';
  serverId: string;
  key: string;
  label: string;
  icon?: string;
  command?: vscode.Command;
}

export type TreeNode = ServerNode | BrainNode | PlaceholderNode;

const STATUS_DESCRIPTION: Record<ServerStatus, string> = {
  signedOut: 'Sign in',
  signingIn: 'Signing in…',
  connected: '',
  authExpired: 'Session expired',
  offline: 'Offline',
  unsupportedAuth: 'No supported sign-in method',
  error: 'Error',
};

export function accessLevelLabel(level: BrainAccessLevel): string {
  switch (level) {
    case BrainAccessLevel.Owner: return 'Owner';
    case BrainAccessLevel.ReadWrite: return 'Read-write';
    case BrainAccessLevel.Read: return 'Read';
    default: return '';
  }
}

/**
 * Native tree of servers and their brains. Every node carries its serverId,
 * so commands invoked from it always act on the right server.
 */
export class ServersTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly counts = new Map<string, BrainCounts>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly sessions: SessionManager) {
    this.disposables.push(sessions.onDidChange(() => this.refresh()));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * The welcome view (sign in / add a Hive Server / create an account) shows
   * only when the tree is empty, so for a new user with nothing but a
   * signed-out cloud entry the tree returns no nodes.
   */
  isEmpty(): boolean {
    const all = this.sessions.all();
    return all.length === 1 && all[0].entry.kind === 'cloud' && all[0].status === 'signedOut';
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (!node) {
      if (this.isEmpty()) {
        return [];
      }
      return this.sessions.all().map((s) => ({ type: 'server', serverId: s.serverId }));
    }
    if (node.type !== 'server') {
      return [];
    }
    const session = this.sessions.get(node.serverId);
    return session ? this.serverChildren(session) : [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.type) {
      case 'server': return this.serverItem(node);
      case 'brain': return this.brainItem(node);
      case 'placeholder': return placeholderItem(node);
    }
  }

  /** Lazily add neuron, type and synapse counts to a brain's tooltip. */
  async resolveTreeItem(item: vscode.TreeItem, node: TreeNode): Promise<vscode.TreeItem> {
    if (node.type !== 'brain') {
      return item;
    }
    const session = this.sessions.get(node.serverId);
    if (!session || session.status !== 'connected') {
      return item;
    }
    const key = countsKey(node);
    let counts = this.counts.get(key);
    if (!counts) {
      try {
        counts = await session.call(() => session.neuronService.getBrainCounts(node.brain.id));
        this.counts.set(key, counts);
      } catch {
        return item;
      }
    }
    item.tooltip = brainTooltip(node.brain, session, counts);
    return item;
  }

  getParent(node: TreeNode): TreeNode | undefined {
    return node.type === 'server' ? undefined : { type: 'server', serverId: node.serverId };
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this._onDidChangeTreeData.dispose();
  }

  private serverChildren(session: ServerSession): TreeNode[] {
    const serverId = session.serverId;
    const arg = { type: 'server', serverId } satisfies ServerNode;

    switch (session.status) {
      case 'signedOut':
      case 'authExpired':
        return [{
          type: 'placeholder', serverId, key: 'sign-in', label: 'Sign in…', icon: 'sign-in',
          command: { command: 'aiqbee.signIn', title: 'Sign In', arguments: [arg] },
        }];
      case 'signingIn':
        return [{
          type: 'placeholder', serverId, key: 'signing-in', label: 'Waiting for sign-in in your browser…',
          icon: 'loading~spin',
          command: { command: 'aiqbee.cancelSignIn', title: 'Cancel Sign In', arguments: [arg] },
        }];
      case 'unsupportedAuth':
        return [{
          type: 'placeholder', serverId, key: 'unsupported',
          label: 'This server has no sign-in method the extension supports', icon: 'info',
        }];
    }

    const brains = session.brains;
    if (!brains) {
      if (session.isLoadingBrains) {
        return [{ type: 'placeholder', serverId, key: 'loading', label: 'Loading…', icon: 'loading~spin' }];
      }
      if (session.status === 'offline' || session.status === 'error' || session.brainsError) {
        return [{
          type: 'placeholder', serverId, key: 'retry',
          label: session.statusMessage || session.brainsError || 'Could not load brains',
          icon: 'refresh',
          command: { command: 'aiqbee.refresh', title: 'Retry', arguments: [arg] },
        }];
      }
      void session.loadBrains().catch(() => undefined);
      return [{ type: 'placeholder', serverId, key: 'loading', label: 'Loading…', icon: 'loading~spin' }];
    }

    if (brains.length === 0) {
      return [{
        type: 'placeholder', serverId, key: 'empty', label: 'No brains yet — create one', icon: 'add',
        command: { command: 'aiqbee.createBrain', title: 'Create Brain', arguments: [arg] },
      }];
    }

    return [...brains]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((brain) => ({ type: 'brain', serverId, brain }));
  }

  private serverItem(node: ServerNode): vscode.TreeItem {
    const session = this.sessions.get(node.serverId);
    if (!session) {
      return new vscode.TreeItem('(removed)');
    }
    const entry = session.entry;
    const status = session.status;
    const item = new vscode.TreeItem(
      entry.label,
      session.hasSession
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.id = `server:${entry.id}`;
    item.description = status === 'connected'
      ? session.user?.email ?? ''
      : STATUS_DESCRIPTION[status];
    item.iconPath = new vscode.ThemeIcon(serverIcon(entry.kind, status));

    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`**${escapeMarkdown(entry.label)}**\n\n`);
    tooltip.appendMarkdown(`${entry.kind === 'cloud' ? 'Aiqbee Cloud' : 'Hive Server'} · ${escapeMarkdown(entry.baseUrl)}\n\n`);
    if (entry.version) {
      tooltip.appendMarkdown(`Version ${escapeMarkdown(entry.version)}\n\n`);
    }
    if (session.user?.email) {
      tooltip.appendMarkdown(`Signed in as ${escapeMarkdown(session.user.email)}\n\n`);
    }
    if (session.statusMessage) {
      tooltip.appendMarkdown(`${escapeMarkdown(session.statusMessage)}\n\n`);
    }
    if (entry.origin === 'setting') {
      tooltip.appendMarkdown('_Managed by the `aiqbee.servers` setting_');
    }
    item.tooltip = tooltip;

    const parts = ['server', status, entry.kind];
    if (entry.origin === 'user') { parts.push('removable'); }
    if (entry.origin === 'setting') { parts.push('managed'); }
    item.contextValue = parts.join('.');
    return item;
  }

  private brainItem(node: BrainNode): vscode.TreeItem {
    const session = this.sessions.get(node.serverId);
    const offline = session?.status === 'offline' || session?.status === 'error';
    const item = new vscode.TreeItem(node.brain.name, vscode.TreeItemCollapsibleState.None);
    item.id = `brain:${node.serverId}:${node.brain.id}`;
    item.description = [accessLevelLabel(node.brain.accessLevel), offline ? 'offline' : '']
      .filter(Boolean).join(' · ');
    item.iconPath = new vscode.ThemeIcon(
      'symbol-namespace',
      offline ? new vscode.ThemeColor('disabledForeground') : undefined,
    );
    item.contextValue = node.brain.canWrite ? 'brain.writable' : 'brain.readonly';
    item.command = { command: 'aiqbee.openBrainGraph', title: 'Open Brain Graph', arguments: [node] };
    if (session) {
      item.tooltip = brainTooltip(node.brain, session, this.counts.get(countsKey(node)));
    }
    return item;
  }
}

function placeholderItem(node: PlaceholderNode): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
  item.id = `placeholder:${node.serverId}:${node.key}`;
  item.contextValue = 'placeholder';
  if (node.icon) {
    item.iconPath = new vscode.ThemeIcon(node.icon);
  }
  item.command = node.command;
  item.tooltip = node.label;
  return item;
}

function serverIcon(kind: 'cloud' | 'hive', status: ServerStatus): string {
  switch (status) {
    case 'authExpired': return 'warning';
    case 'offline': return 'debug-disconnect';
    case 'unsupportedAuth':
    case 'error': return 'error';
    default: return kind === 'cloud' ? 'cloud' : 'server';
  }
}

function brainTooltip(brain: BrainWithAccessDto, session: ServerSession, counts?: BrainCounts): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${escapeMarkdown(brain.name)}**\n\n`);
  if (brain.description) {
    md.appendMarkdown(`${escapeMarkdown(brain.description)}\n\n`);
  }
  md.appendMarkdown(`${escapeMarkdown(session.entry.label)} · ${accessLevelLabel(brain.accessLevel)}\n\n`);
  if (counts) {
    md.appendMarkdown(`${counts.neurons} neurons · ${counts.neuronTypes} types · ${counts.synapses} synapses`);
  }
  return md;
}

function countsKey(node: BrainNode): string {
  return `${node.serverId}:${node.brain.id}`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}
