// Mirrors the message contract in src/api/types.ts (the webview is built separately).

export type ServerStatus =
  | 'signedOut' | 'signingIn' | 'connected' | 'authExpired' | 'offline' | 'unsupportedAuth' | 'error';

export interface ServerViewModel {
  id: string;
  kind: 'cloud' | 'hive';
  label: string;
  baseUrl: string;
  status: ServerStatus;
  statusMessage?: string;
  user?: { givenName: string; familyName: string; email: string };
  authProviders: string[];
  removable: boolean;
  managed: boolean;
  signUpUrl?: string;
}

export interface AuthAction {
  state: string;
  message: string;
  signUpUrl?: string;
}

export type SignInProvider = 'entra' | 'google';

/** Servers that hold a session (signed in, even if currently unreachable). */
export function hasSession(server: ServerViewModel): boolean {
  return server.status === 'connected' || server.status === 'offline' || server.status === 'error';
}
