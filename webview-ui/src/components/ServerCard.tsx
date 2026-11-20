import { useState } from 'react';
import type { AuthAction, ServerViewModel, SignInProvider } from '../types';
import { hasSession } from '../types';

interface ServerCardProps {
  server: ServerViewModel;
  emailFormOpen: boolean;
  authAction?: AuthAction;
  error?: string;
  onSignIn: (provider: SignInProvider) => void;
  onToggleEmailForm: () => void;
  onSignInEmail: (email: string, password: string) => void;
  onCancelSignIn: () => void;
  onSignOut: () => void;
  onRemove: () => void;
  onOpenExternal: (url: string) => void;
  onDismiss: () => void;
}

const STATUS_LABEL: Record<ServerViewModel['status'], string> = {
  signedOut: 'Signed out',
  signingIn: 'Signing in…',
  connected: 'Connected',
  authExpired: 'Session expired',
  offline: 'Offline',
  unsupportedAuth: 'No supported sign-in method',
  error: 'Error',
};

export function ServerCard({
  server,
  emailFormOpen,
  authAction,
  error,
  onSignIn,
  onToggleEmailForm,
  onSignInEmail,
  onCancelSignIn,
  onSignOut,
  onRemove,
  onOpenExternal,
  onDismiss,
}: ServerCardProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signedIn = hasSession(server);
  const signingIn = server.status === 'signingIn';
  const canSignIn = server.status === 'signedOut' || server.status === 'authExpired';
  const hasEntra = server.authProviders.includes('entra');
  const hasGoogle = server.authProviders.includes('google');
  const hasEmail = server.authProviders.includes('email');
  const idPrefix = `server-${server.id}`;

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      onSignInEmail(email, password);
      setPassword('');
    }
  };

  return (
    <section className="server-card" aria-label={server.label}>
      <div className="server-card-header">
        <div className="server-card-title">
          <span className="server-card-name">{server.label}</span>
          <span className={`server-status server-status-${server.status}`}>{STATUS_LABEL[server.status]}</span>
        </div>
        <div className="server-card-url">
          {server.kind === 'cloud' ? 'Aiqbee Cloud' : 'Hive Server'} · {server.baseUrl}
        </div>
      </div>

      {signedIn && server.user && (
        <div className="server-card-user">
          Signed in as {server.user.givenName} {server.user.familyName} ({server.user.email})
        </div>
      )}

      {server.statusMessage && server.status !== 'connected' && (
        <div className="server-card-message">{server.statusMessage}</div>
      )}

      {error && <div className="error-message">{error}</div>}

      {authAction && (
        <div className="auth-action-banner">
          <div>{authAction.message}</div>
          {authAction.state === 'SignUpRequired' && authAction.signUpUrl && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onDismiss();
                onOpenExternal(authAction.signUpUrl!);
              }}
            >
              Sign up for Aiqbee
            </button>
          )}
          <button type="button" className="link" onClick={onDismiss}>Dismiss</button>
        </div>
      )}

      {server.status === 'unsupportedAuth' && (
        <div className="server-card-message">
          This server has no sign-in method the extension supports. Ask your administrator to enable
          Microsoft or Google sign-in.
        </div>
      )}

      {signingIn && (
        <div className="sign-in-panel">
          <div className="server-card-message">
            <span className="spinner spinner-inline" /> Signing in… If a browser window opened, finish signing in there.
          </div>
          <button type="button" className="btn-secondary" onClick={onCancelSignIn}>Cancel Sign In</button>
        </div>
      )}

      {canSignIn && (
        <div className="sign-in-panel">
          <div className="auth-buttons">
            {hasEntra && (
              <button type="button" className="auth-button auth-button-microsoft" onClick={() => onSignIn('entra')}>
                <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                <span>Sign in with Microsoft</span>
              </button>
            )}
            {hasGoogle && (
              <button type="button" className="auth-button auth-button-google" onClick={() => onSignIn('google')}>
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107" />
                  <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00" />
                  <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50" />
                  <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2" />
                </svg>
                <span>Sign in with Google</span>
              </button>
            )}
            {hasEmail && (
              <button
                type="button"
                className="auth-button auth-button-email"
                aria-expanded={emailFormOpen}
                onClick={onToggleEmailForm}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M1 4l7 4 7-4v8H1V4zm0-1h14l-7 4L1 3z" />
                </svg>
                <span>Sign in with Email</span>
              </button>
            )}
          </div>

          {emailFormOpen && hasEmail && (
            <form onSubmit={submitEmail} className="email-form">
              <div className="form-group">
                <label htmlFor={`${idPrefix}-email`}>Email</label>
                <input
                  id={`${idPrefix}-email`}
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor={`${idPrefix}-password`}>Password</label>
                <input
                  id={`${idPrefix}-password`}
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={!email || !password}>Sign In</button>
            </form>
          )}

          {server.signUpUrl && !authAction && (
            <div className="auth-info">
              Don&apos;t have an account?{' '}
              <button type="button" className="link" onClick={() => onOpenExternal(server.signUpUrl!)}>
                Sign up free
              </button>
            </div>
          )}
        </div>
      )}

      <div className="server-card-actions">
        {signedIn && (
          <button type="button" className="btn-secondary" onClick={onSignOut}>Sign Out</button>
        )}
        {server.removable && (
          <button type="button" className="btn-secondary" onClick={onRemove}>Remove</button>
        )}
        {server.managed && <span className="server-card-note">Managed by the aiqbee.servers setting</span>}
      </div>
    </section>
  );
}
