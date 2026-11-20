import { useState } from 'react';
import { ServerCard } from '../components/ServerCard';
import type { AuthAction, ServerViewModel, SignInProvider } from '../types';

interface AccountPageProps {
  servers: ServerViewModel[];
  environment?: string;
  emailFormFor?: string;
  authActions: Record<string, AuthAction>;
  errors: Record<string, string>;
  generalError?: string;
  onSignIn: (serverId: string, provider: SignInProvider) => void;
  onToggleEmailForm: (serverId: string) => void;
  onSignInEmail: (serverId: string, email: string, password: string) => void;
  onCancelSignIn: (serverId: string) => void;
  onSignOut: (serverId: string) => void;
  onRemove: (serverId: string) => void;
  onAddServer: (url: string) => void;
  onOpenExternal: (url: string) => void;
  onDismiss: (serverId?: string) => void;
}

export function AccountPage({
  servers,
  environment,
  emailFormFor,
  authActions,
  errors,
  generalError,
  onSignIn,
  onToggleEmailForm,
  onSignInEmail,
  onCancelSignIn,
  onSignOut,
  onRemove,
  onAddServer,
  onOpenExternal,
  onDismiss,
}: AccountPageProps) {
  const [hiveUrl, setHiveUrl] = useState('');
  const anySignedIn = servers.some((s) => s.signedIn);

  const submitHive = (e: React.FormEvent) => {
    e.preventDefault();
    if (hiveUrl.trim()) {
      onAddServer(hiveUrl.trim());
      setHiveUrl('');
    }
  };

  return (
    <div className="page">
      {!anySignedIn && (
        <div className="welcome">
          <div className="welcome-title">Aiqbee Brain Manager</div>
          <div className="welcome-desc">
            Sign in to Aiqbee Cloud or your Hive Servers to browse your brains and connect them to
            Claude Code, Codex, Cursor and other AI assistants. Your brains appear in the Brains view above.
          </div>
        </div>
      )}

      {generalError && (
        <div className="error-message">
          {generalError}{' '}
          <button type="button" className="link" onClick={() => onDismiss()}>Dismiss</button>
        </div>
      )}

      <div className="server-list">
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            emailFormOpen={emailFormFor === server.id}
            authAction={authActions[server.id]}
            error={errors[server.id]}
            onSignIn={(provider) => onSignIn(server.id, provider)}
            onToggleEmailForm={() => onToggleEmailForm(server.id)}
            onSignInEmail={(email, password) => onSignInEmail(server.id, email, password)}
            onCancelSignIn={() => onCancelSignIn(server.id)}
            onSignOut={() => onSignOut(server.id)}
            onRemove={() => onRemove(server.id)}
            onOpenExternal={onOpenExternal}
            onDismiss={() => onDismiss(server.id)}
          />
        ))}
      </div>

      <form onSubmit={submitHive} className="add-server-form" aria-label="Add Hive Server">
        <div className="form-group">
          <label htmlFor="hive-url">Add a Hive Server</label>
          <div className="add-server-row">
            <input
              id="hive-url"
              type="text"
              placeholder="hive.yourcompany.com"
              value={hiveUrl}
              onChange={(e) => setHiveUrl(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={!hiveUrl.trim()}>Add</button>
          </div>
        </div>
      </form>

      {environment && (
        <div className="environment-note">
          Environment: <span>{environment}</span>
        </div>
      )}
    </div>
  );
}
