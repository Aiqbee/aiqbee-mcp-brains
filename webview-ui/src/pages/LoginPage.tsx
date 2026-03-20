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

      <div className="auth-buttons">
        <button
          className="auth-button auth-button-microsoft"
          onClick={onSignInMicrosoft}
          disabled={loading}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="6.5" height="6.5" />
            <rect x="8.5" y="1" width="6.5" height="6.5" />
            <rect x="1" y="8.5" width="6.5" height="6.5" />
            <rect x="8.5" y="8.5" width="6.5" height="6.5" />
          </svg>
          Sign in with Microsoft
          {loading && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
        </button>

        <button
          className="auth-button auth-button-google"
          onClick={onSignInGoogle}
          disabled={loading}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3.2c1.3 0 2.4.4 3.3 1.2l2.4-2.4C12.3.8 10.3 0 8 0 4.9 0 2.2 1.7.9 4.2l2.8 2.2C4.4 4.4 6 3.2 8 3.2z" />
            <path d="M15.6 8.2c0-.6-.1-1.2-.2-1.8H8v3.4h4.3c-.2 1-.7 1.8-1.5 2.4l2.8 2.2c1.5-1.4 2.4-3.5 2.4-6.2z" />
          </svg>
          Sign in with Google
        </button>

        <button
          className="auth-button auth-button-email"
          onClick={() => setShowEmailForm(!showEmailForm)}
          disabled={loading}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 4l7 4 7-4v8H1V4zm0-1h14l-7 4L1 3z" />
          </svg>
          Sign in with Email
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
          Don't have an account?{' '}
        </span>
        <button className="link" onClick={onCreateAccount} style={{ background: 'none', border: 'none' }}>
          Create Account
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
