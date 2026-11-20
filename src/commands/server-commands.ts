import * as vscode from 'vscode';
import { AuthStateError, SignInCancelledError } from '../auth/auth-service.js';
import { DuplicateServerError, normaliseUrl, type ConnectionManager, type ServerEntry } from '../connection/connection.js';
import type { SessionManager } from '../connection/session-manager.js';
import type { ServerSession, SignInProvider } from '../connection/server-session.js';
import { SERVERS_VIEW_ID } from '../views/servers-tree.js';

/** Anything a command can be invoked with: a tree node, a webview payload or a bare id. */
export type ServerArg = { serverId: string } | string | undefined;

export interface ServerCommandDeps {
  registry: ConnectionManager;
  sessions: SessionManager;
  /** Show the email sign-in form for a server in the Account view. */
  showEmailSignIn: (serverId: string) => void;
  /** Aiqbee web app URL, used for sign-up links on cloud. */
  webAppUrl: string;
}

type ProviderChoice = SignInProvider | 'email';

const PROVIDER_LABELS: Record<string, { choice: ProviderChoice; label: string }> = {
  entra: { choice: 'entra', label: 'Microsoft' },
  google: { choice: 'google', label: 'Google' },
  email: { choice: 'email', label: 'Email and password' },
};

export function serverIdOf(arg: ServerArg): string | undefined {
  return typeof arg === 'string' ? arg : arg?.serverId;
}

/**
 * Resolve the session a command acts on: the one named by the argument, or
 * the user's pick from the sessions that pass `filter`. Returns undefined if
 * the user cancels or nothing qualifies.
 */
export async function resolveSession(
  sessions: SessionManager,
  arg: ServerArg,
  options: { placeHolder: string; filter?: (s: ServerSession) => boolean; emptyMessage?: string },
): Promise<ServerSession | undefined> {
  const id = serverIdOf(arg);
  if (id) {
    return sessions.require(id);
  }
  const candidates = sessions.all().filter(options.filter ?? (() => true));
  if (candidates.length === 0) {
    if (options.emptyMessage) {
      void vscode.window.showInformationMessage(options.emptyMessage);
    }
    return undefined;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map((s) => ({ label: s.entry.label, description: s.entry.baseUrl, session: s })),
    { placeHolder: options.placeHolder },
  );
  return picked?.session;
}

export async function addServer(deps: ServerCommandDeps, url?: string): Promise<ServerEntry | undefined> {
  const input = url ?? await vscode.window.showInputBox({
    title: 'Add Hive Server',
    prompt: 'Enter the address of your Hive Server',
    placeHolder: 'hive.yourcompany.com',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value.trim()) { return undefined; }
      try {
        normaliseUrl(value);
        return undefined;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
  });
  if (!input?.trim()) {
    return undefined;
  }

  let entry: ServerEntry;
  try {
    entry = await vscode.window.withProgress(
      { location: { viewId: SERVERS_VIEW_ID }, title: 'Connecting to Hive Server…' },
      () => deps.registry.addHive(input),
    );
  } catch (err) {
    if (err instanceof DuplicateServerError) {
      void vscode.window.showInformationMessage(err.message);
      return err.existing;
    }
    void vscode.window.showErrorMessage(`Could not add Hive Server: ${messageOf(err)}`);
    return undefined;
  }

  if (entry.authProviders.length === 0) {
    void vscode.window.showWarningMessage(
      `${entry.label} was added, but it has no sign-in method the extension supports yet.`,
    );
    return entry;
  }

  const choice = await vscode.window.showInformationMessage(`Added ${entry.label}.`, 'Sign In');
  if (choice === 'Sign In') {
    await signIn(deps, entry.id);
  }
  return entry;
}

export async function renameServer(deps: ServerCommandDeps, arg: ServerArg): Promise<void> {
  const session = await resolveSession(deps.sessions, arg, { placeHolder: 'Rename which server?' });
  if (!session) { return; }
  const label = await vscode.window.showInputBox({
    title: 'Rename Server',
    value: session.entry.label,
    validateInput: (v) => (v.trim() ? undefined : 'Enter a name'),
  });
  if (label?.trim()) {
    await deps.registry.rename(session.serverId, label);
  }
}

export async function removeServer(deps: ServerCommandDeps, arg: ServerArg): Promise<void> {
  const session = await resolveSession(deps.sessions, arg, {
    placeHolder: 'Remove which server?',
    filter: (s) => s.entry.origin === 'user',
    emptyMessage: 'There are no Hive Servers to remove.',
  });
  if (!session) { return; }
  const entry = session.entry;
  if (entry.origin !== 'user') {
    void vscode.window.showInformationMessage(
      entry.origin === 'builtin'
        ? 'Aiqbee Cloud cannot be removed. You can sign out instead.'
        : `${entry.label} is managed by the aiqbee.servers setting. Remove it there.`,
    );
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    `Remove ${entry.label}?`,
    { modal: true, detail: 'You will be signed out of this server and its brain graph panels will close.' },
    'Remove',
  );
  if (confirmed === 'Remove') {
    await deps.registry.remove(entry.id);
  }
}

export async function signIn(deps: ServerCommandDeps, arg: ServerArg): Promise<void> {
  const session = await resolveSession(deps.sessions, arg, {
    placeHolder: 'Sign in to which server?',
    filter: (s) => !s.hasSession && s.status !== 'unsupportedAuth',
    emptyMessage: 'You are signed in to every server.',
  });
  if (!session) { return; }

  const providers = session.entry.authProviders
    .map((p) => PROVIDER_LABELS[p])
    .filter((p): p is { choice: ProviderChoice; label: string } => p !== undefined);
  if (providers.length === 0) {
    void vscode.window.showWarningMessage(
      `${session.entry.label} has no sign-in method that the extension supports.`,
    );
    return;
  }

  let choice: ProviderChoice | undefined = providers[0].choice;
  if (providers.length > 1) {
    const picked = await vscode.window.showQuickPick(
      providers.map((p) => ({ label: `Sign in with ${p.label}`, choice: p.choice })),
      { placeHolder: `Sign in to ${session.entry.label}` },
    );
    choice = picked?.choice;
  }
  if (!choice) { return; }

  if (choice === 'email') {
    deps.showEmailSignIn(session.serverId);
    return;
  }
  await runSignIn(session, deps.webAppUrl, () => session.signIn(choice as SignInProvider));
}

/** Run a sign-in flow and report failures. Shared with the Account view. */
export async function runSignIn(session: ServerSession, webAppUrl: string, flow: () => Promise<void>): Promise<void> {
  try {
    await flow();
  } catch (err) {
    await reportSignInError(session, webAppUrl, err);
  }
}

export async function reportSignInError(session: ServerSession, webAppUrl: string, err: unknown): Promise<void> {
  if (err instanceof SignInCancelledError) {
    return;
  }
  if (err instanceof AuthStateError) {
    const canSignUp = err.state === 'SignUpRequired' && session.entry.kind === 'cloud';
    const action = await vscode.window.showWarningMessage(err.message, ...(canSignUp ? ['Sign Up'] : []));
    if (action === 'Sign Up') {
      await vscode.env.openExternal(vscode.Uri.parse(signUpUrl(webAppUrl)));
    }
    return;
  }
  void vscode.window.showErrorMessage(`Sign in to ${session.entry.label} failed: ${messageOf(err)}`);
}

export async function signOut(deps: ServerCommandDeps, arg: ServerArg): Promise<void> {
  const session = await resolveSession(deps.sessions, arg, {
    placeHolder: 'Sign out of which server?',
    filter: (s) => s.hasSession,
    emptyMessage: 'You are not signed in to any server.',
  });
  await session?.signOut();
}

export function cancelSignIn(deps: ServerCommandDeps, arg: ServerArg): void {
  const id = serverIdOf(arg);
  const targets = id ? [deps.sessions.require(id)] : deps.sessions.all().filter((s) => s.status === 'signingIn');
  targets.forEach((s) => s.cancelSignIn());
}

export async function refresh(deps: ServerCommandDeps, arg: ServerArg): Promise<void> {
  const id = serverIdOf(arg);
  const targets = id ? [deps.sessions.require(id)] : deps.sessions.all();
  await vscode.window.withProgress(
    { location: { viewId: SERVERS_VIEW_ID } },
    () => Promise.allSettled(targets.map((s) => s.refresh())),
  );
}

/** The Aiqbee Cloud sign-up page. */
export function signUpUrl(webAppUrl: string): string {
  return `${webAppUrl.replace(/\/+$/, '')}/signup`;
}

export function registerServerCommands(deps: ServerCommandDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('aiqbee.signUp', () =>
      vscode.env.openExternal(vscode.Uri.parse(signUpUrl(deps.webAppUrl)))),
    vscode.commands.registerCommand('aiqbee.addServer', (url?: unknown) =>
      addServer(deps, typeof url === 'string' ? url : undefined)),
    vscode.commands.registerCommand('aiqbee.renameServer', (arg?: ServerArg) => renameServer(deps, arg)),
    vscode.commands.registerCommand('aiqbee.removeServer', (arg?: ServerArg) => removeServer(deps, arg)),
    vscode.commands.registerCommand('aiqbee.signIn', (arg?: ServerArg) => signIn(deps, arg)),
    vscode.commands.registerCommand('aiqbee.signOut', (arg?: ServerArg) => signOut(deps, arg)),
    vscode.commands.registerCommand('aiqbee.cancelSignIn', (arg?: ServerArg) => cancelSignIn(deps, arg)),
    vscode.commands.registerCommand('aiqbee.refresh', (arg?: ServerArg) => refresh(deps, arg)),
  ];
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
