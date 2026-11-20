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
  /** A sign-in is stored for this server (it may still be offline). */
  signedIn: boolean;
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

/** Whether the card should offer sign-in buttons. */
export function canSignIn(server: ServerViewModel): boolean {
  return !server.signedIn && server.status !== 'signingIn' && server.status !== 'unsupportedAuth';
}
