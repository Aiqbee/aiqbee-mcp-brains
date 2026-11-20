import * as vscode from 'vscode';
import { ApiRequestError } from '../api/api-client.js';
import type { BrainTemplateDto, BrainWithAccessDto } from '../api/types.js';
import type { SessionManager } from '../connection/session-manager.js';
import type { ServerSession } from '../connection/server-session.js';
import { addMcpConnection } from '../mcp/mcp-config.js';
import { accessLevelLabel } from '../views/servers-tree.js';
import { messageOf, resolveSession, type ServerArg } from './server-commands.js';

/** A brain as passed from the tree (BrainNode) or another caller. */
export interface BrainArg {
  serverId: string;
  brain: BrainWithAccessDto;
}

export interface BrainCommandDeps {
  sessions: SessionManager;
  openGraph: (session: ServerSession, brain: BrainWithAccessDto) => void;
  webAppUrl: string;
}

const FIRST_BRAIN_DEFAULTS = {
  name: 'Development Patterns & Practices',
  description: 'Shared knowledge base for development standards, coding patterns, architecture decisions, and lessons learned across the team.',
};

export interface SubscriptionLimitError {
  errorCode: string;
  message: string;
  currentCount: number;
  maxAllowed: number;
}

/** Parse the structured limit error the backends return from POST /api/brains. */
export function parseSubscriptionLimitError(err: unknown): SubscriptionLimitError | null {
  if (!(err instanceof ApiRequestError) || err.status !== 400 || !err.body) {
    return null;
  }
  try {
    const body = typeof err.body === 'string' ? JSON.parse(err.body) : err.body;
    if (body?.errorCode && typeof body.currentCount === 'number' && typeof body.maxAllowed === 'number') {
      return {
        errorCode: body.errorCode,
        message: body.message || err.message,
        currentCount: body.currentCount,
        maxAllowed: body.maxAllowed,
      };
    }
  } catch { /* not a structured error */ }
  return null;
}

function isBrainArg(arg: unknown): arg is BrainArg {
  return typeof arg === 'object' && arg !== null && 'brain' in arg && 'serverId' in arg;
}

/** Resolve a brain from a tree node, or ask for a server and then a brain. */
export async function resolveBrain(
  sessions: SessionManager,
  arg: unknown,
  placeHolder: string,
): Promise<{ session: ServerSession; brain: BrainWithAccessDto } | undefined> {
  if (isBrainArg(arg)) {
    return { session: sessions.require(arg.serverId), brain: arg.brain };
  }
  const session = await resolveSession(sessions, arg as ServerArg, {
    placeHolder: 'Which server?',
    filter: (s) => s.hasSession,
    emptyMessage: 'Sign in to a server first.',
  });
  if (!session) {
    return undefined;
  }
  let brains: BrainWithAccessDto[];
  try {
    brains = session.brains ?? await session.loadBrains();
  } catch (err) {
    void vscode.window.showErrorMessage(`Could not load brains from ${session.entry.label}: ${messageOf(err)}`);
    return undefined;
  }
  if (brains.length === 0) {
    void vscode.window.showInformationMessage(`${session.entry.label} has no brains yet.`);
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    brains.map((brain) => ({ label: brain.name, description: accessLevelLabel(brain.accessLevel), brain })),
    { placeHolder },
  );
  return picked ? { session, brain: picked.brain } : undefined;
}

export async function createBrain(deps: BrainCommandDeps, arg: ServerArg): Promise<void> {
  const session = await resolveSession(deps.sessions, arg, {
    placeHolder: 'Create the brain on which server?',
    filter: (s) => s.status === 'connected',
    emptyMessage: 'Sign in to a server first.',
  });
  if (!session) { return; }
  const isFirst = session.brains?.length === 0;
  const where = session.entry.label;

  const name = await vscode.window.showInputBox({
    title: `New Brain on ${where} (1/3)`,
    prompt: 'Brain name',
    value: isFirst ? FIRST_BRAIN_DEFAULTS.name : '',
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim() ? undefined : 'Enter a name'),
  });
  if (!name?.trim()) { return; }

  const description = await vscode.window.showInputBox({
    title: `New Brain on ${where} (2/3)`,
    prompt: 'Description (optional)',
    value: isFirst ? FIRST_BRAIN_DEFAULTS.description : '',
    ignoreFocusOut: true,
  });
  if (description === undefined) { return; }

  let templates: BrainTemplateDto[] = [];
  try {
    templates = await session.call(() => session.brainService.getBrainTemplates()) ?? [];
  } catch {
    // Templates are optional — continue with a blank brain.
  }
  const templateItems = [
    ...[...templates]
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      .map((t) => ({ label: t.name, description: t.isDefault ? 'Recommended' : undefined, detail: t.description, id: t.id as string | undefined })),
    { label: 'No template', description: 'Blank brain', detail: undefined, id: undefined },
  ];
  const template = await vscode.window.showQuickPick(templateItems, {
    title: `New Brain on ${where} (3/3)`,
    placeHolder: 'Start from a template',
    ignoreFocusOut: true,
  });
  if (!template) { return; }

  try {
    const brain = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Creating ${name.trim()}…` },
      () => session.call(() => session.brainService.createBrain({
        name: name.trim(),
        description: description.trim() || undefined,
        brainTemplateId: template.id,
      })),
    );
    const brains = await session.loadBrains(true).catch(() => session.brains ?? []);
    const created = brains.find((b) => b.id === brain.id);
    const action = await vscode.window.showInformationMessage(
      `Created ${brain.name} on ${where}.`,
      ...(created ? ['Open Graph', 'Add MCP Connection'] : []),
    );
    if (created && action === 'Open Graph') {
      deps.openGraph(session, created);
    } else if (created && action === 'Add MCP Connection') {
      await addMcpConnection(created.id, created.name, session.entry.mcpBaseUrl);
    }
  } catch (err) {
    const limit = parseSubscriptionLimitError(err);
    if (limit) {
      const detail = `${limit.message} (${limit.currentCount} of ${limit.maxAllowed} brains used)`;
      if (session.entry.kind === 'cloud') {
        const action = await vscode.window.showWarningMessage(detail, 'Manage Plan');
        if (action === 'Manage Plan') {
          await vscode.env.openExternal(vscode.Uri.parse(deps.webAppUrl));
        }
      } else {
        void vscode.window.showWarningMessage(`${detail} Contact your administrator to upgrade the Hive Server licence.`);
      }
      return;
    }
    void vscode.window.showErrorMessage(`Could not create the brain: ${messageOf(err)}`);
  }
}

export async function openBrainGraph(deps: BrainCommandDeps, arg: unknown): Promise<void> {
  const target = await resolveBrain(deps.sessions, arg, 'Open the graph for which brain?');
  if (target) {
    deps.openGraph(target.session, target.brain);
  }
}

export async function addMcpConnectionCommand(deps: BrainCommandDeps, arg: unknown): Promise<void> {
  const target = await resolveBrain(deps.sessions, arg, 'Add an MCP connection for which brain?');
  if (target) {
    await addMcpConnection(target.brain.id, target.brain.name, target.session.entry.mcpBaseUrl);
  }
}

/** Open Aiqbee Cloud, or a brain on it, in the web app. Only offered on cloud nodes. */
export async function openInWebApp(deps: BrainCommandDeps, arg: unknown): Promise<void> {
  const base = deps.webAppUrl.replace(/\/+$/, '');
  if (isBrainArg(arg)) {
    await vscode.env.openExternal(vscode.Uri.parse(`${base}/brain/${encodeURIComponent(arg.brain.id)}`));
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(base));
}

export function registerBrainCommands(deps: BrainCommandDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('aiqbee.createBrain', (arg?: ServerArg) => createBrain(deps, arg)),
    vscode.commands.registerCommand('aiqbee.openBrainGraph', (arg?: unknown) => openBrainGraph(deps, arg)),
    vscode.commands.registerCommand('aiqbee.addMcpConnection', (arg?: unknown) => addMcpConnectionCommand(deps, arg)),
    vscode.commands.registerCommand('aiqbee.openInWebApp', (arg?: unknown) => openInWebApp(deps, arg)),
  ];
}
