import { useState } from 'react';

interface LoginPageProps {
  loading: boolean;
  error?: string;
  environment?: string;
  onSignInMicrosoft: () => void;
  onSignInGoogle: () => void;
  onSignInEmail: (email: string, password: string) => void;
  onCreateAccount: () => void;
}

export function LoginPage({
  loading,
  error,
  environment,
  onSignInMicrosoft,
  onSignInGoogle,
  onSignInEmail,
  onCreateAccount,
}: LoginPageProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      onSignInEmail(email, password);
    }
  };

  return (
    <div className="page">
      <div className="welcome">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <circle cx="6" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <circle cx="18" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <line x1="10" y1="10.5" x2="7.5" y2="14" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="14" y1="10.5" x2="16.5" y2="14" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="8.5" y1="16" x2="15.5" y2="16" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <div className="welcome-title">Aiqbee Brain Manager</div>
        <div className="welcome-desc">
          Sign in to browse your brains and configure MCP connections for AI coding assistants.
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="auth-info">
        Already have a Microsoft or Google work account? Sign in directly — your Aiqbee account will be created automatically on first sign-in.
      </div>

      <div className="auth-buttons">
        <button
          className="auth-button auth-button-microsoft"
          onClick={onSignInMicrosoft}
          disabled={loading}
        >
          <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          <span>Sign in with Microsoft</span>
          {loading && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
        </button>

        <button
          className="auth-button auth-button-google"
          onClick={onSignInGoogle}
          disabled={loading}
        >
          <svg width="16" height="16" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
            <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
            <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
            <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
          </svg>
          <span>Sign in with Google</span>
        </button>

        <button
          className="auth-button auth-button-email"
          onClick={() => setShowEmailForm(!showEmailForm)}
          disabled={loading}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 4l7 4 7-4v8H1V4zm0-1h14l-7 4L1 3z" />
          </svg>
          <span>Sign in with Email</span>
        </button>
      </div>

      {showEmailForm && (
        <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading || !email || !password}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      )}

      <div className="divider" />

      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)' }}>
          No account yet?{' '}
        </span>
        <button className="link" onClick={onCreateAccount} style={{ background: 'none', border: 'none' }}>
          Create an email account
        </button>
      </div>

      {environment && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 4 }}>
          Environment: <span style={{ fontWeight: 600 }}>{environment}</span>
        </div>
      )}
    </div>
  );
}
