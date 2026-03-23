import { useState } from 'react';

interface LoginPageProps {
  loading: boolean;
  error?: string;
  environment?: string;
  backendType: 'cloud' | 'hive';
  hiveLabel?: string;
  authProviders: string[];
  onSignInMicrosoft: () => void;
  onSignInGoogle: () => void;
  onSignInEmail: (email: string, password: string) => void;
  onCreateAccount: () => void;
  authActionState?: string;
  authActionMessage?: string;
  authActionWebAppUrl?: string;
  onClearAuthAction: () => void;
  onOpenExternal: (url: string) => void;
  onConnectToHive: (url: string) => void;
  onDisconnectHive: () => void;
}

export function LoginPage({
  loading,
  error,
  environment,
  backendType,
  hiveLabel,
  authProviders,
  onSignInMicrosoft,
  onSignInGoogle,
  onSignInEmail,
  onCreateAccount,
  authActionState,
  authActionMessage,
  authActionWebAppUrl,
  onClearAuthAction,
  onOpenExternal,
  onConnectToHive,
  onDisconnectHive,
}: LoginPageProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showHiveForm, setShowHiveForm] = useState(false);
  const [hiveUrl, setHiveUrl] = useState('');

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      onSignInEmail(email, password);
    }
  };

  const handleHiveConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (hiveUrl.trim()) {
      onConnectToHive(hiveUrl.trim());
    }
  };

  const isHive = backendType === 'hive';
  const hasEntra = authProviders.includes('entra');
  const hasGoogle = authProviders.includes('google');
  const hasEmail = authProviders.includes('email');

  return (
    <div className="page">
      <div className="welcome">
        <svg width="40" height="40" viewBox="17 24 116 130" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M129.49 114.51C129.121 116.961 128.187 119.293 126.762 121.322C125.337 123.351 123.461 125.021 121.28 126.2C120.676 126.535 120.043 126.816 119.39 127.04C120.22 138.04 102.74 142.04 93.32 139.42L96.82 151.66L87.82 151.98L72.07 129.43C66.76 130.93 60.49 131.65 56.44 125.15C56.0721 124.553 55.7382 123.935 55.44 123.3C54.4098 123.51 53.3614 123.617 52.31 123.62C49.31 123.62 44.31 122.72 41.77 120.96C39.7563 119.625 38.1588 117.75 37.16 115.55C31.75 116.29 27.16 115.02 24.16 111.88C20.36 107.97 19.28 101.51 21.26 94.58C23.87 85.33 31.81 74.91 47.59 71C48.9589 69.2982 50.5972 67.8322 52.44 66.66C62.35 60.31 78.44 59.76 90.65 65.79C95.3836 64.9082 100.27 65.376 104.75 67.14C113.53 70.43 119.91 77.31 121.11 84.3C123.487 85.5317 125.433 87.4568 126.69 89.82C129.32 94.76 129.69 99.71 127.92 103.71C129.587 107.049 130.138 110.835 129.49 114.51ZM123.01 109.31C121.612 110.048 120.056 110.434 118.475 110.434C116.894 110.434 115.338 110.048 113.94 109.31L114.67 104.46C117.75 104.76 120.26 103.8 121.57 101.83C123.04 99.64 122.81 96.39 120.95 92.9C118.87 88.99 114.38 88.37 111.89 88.34H111.73C105.49 88.34 99.13 91.89 96.56 96.52L92.82 94.73C93.5553 92.3449 94.8046 90.15 96.48 88.3C95.0376 87.0754 93.9474 85.4887 93.3217 83.703C92.696 81.9173 92.5574 79.9971 92.92 78.14L96.61 77.8C96.7789 79.302 97.4 80.7172 98.3911 81.8583C99.3822 82.9994 100.697 83.8125 102.16 84.19C105.238 82.8161 108.58 82.1335 111.95 82.19C112.43 82.19 112.89 82.24 113.36 82.27C110.969 78.0312 107.18 74.7545 102.64 73C91.56 68.7 84.09 75.37 82.38 77.67C78.26 83.19 80.9 88.41 82.91 91.8L79.61 94.8C76.736 92.314 74.8075 88.9127 74.15 85.17C69.92 86.44 64.24 86.17 61.06 80.74L64.06 78.68C67.43 81.2 72.78 80.98 75.32 77.87C75.9252 76.4949 76.6905 75.1959 77.6 74C79.044 72.093 80.7864 70.4316 82.76 69.08C74.47 66.82 62.76 67.19 55.68 71.73C53.7668 72.841 52.192 74.4517 51.1244 76.3895C50.0569 78.3274 49.5368 80.5192 49.62 82.73C49.62 86.3 52.42 91.94 56.19 92.82L54 97.07C51.5946 96.5129 49.4109 95.2487 47.73 93.44L44.48 97.58L41.23 96L44.41 87.68C43.8904 86.064 43.624 84.3774 43.62 82.68C43.628 81.3361 43.7687 79.9963 44.04 78.68C34.04 82.81 29.1 89.68 27.29 95.96C25.9 100.79 26.44 105.15 28.72 107.49C30.53 109.35 33.3 109.79 35.91 109.62L42.91 104.17L45.21 106.11L43.13 112.93C44.22 116.4 47.79 118.19 54.3 116.93C54.6375 114.169 55.7272 111.554 57.45 109.37C58.7133 107.552 60.3846 106.056 62.33 105L65.75 95.79L69.17 95.64L68.8 103.19C74.55 102.6 80.98 103.77 86.97 102.87L88.07 106.87C79.29 110.93 70.3 104.31 62.15 113.04C59.22 116.18 60.34 118.91 62.15 121.66C64.76 125.59 69.66 123.23 74.67 121.66C82.26 119.34 87.77 117.66 98.16 118.51C95.68 113.8 95.92 108.11 99.24 101.85L104.13 103.78C100.7 111.69 103.91 116.27 106.13 118.29C109.56 121.41 114.72 122.35 118.13 120.47C119.436 119.749 120.559 118.737 121.412 117.513C122.265 116.289 122.825 114.885 123.05 113.41C123.275 112.051 123.258 110.663 123 109.31H123.01Z" fill="currentColor"/>
        </svg>
        <div className="welcome-title">Aiqbee Brain Manager</div>
        <div className="welcome-desc">
          Sign in to browse your brains and configure MCP connections for AI coding assistants.
        </div>
      </div>

      {isHive && (
        <div className="hive-indicator">
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--vscode-foreground)' }}>
            Connected to {hiveLabel}
          </div>
          <button
            className="link"
            onClick={onDisconnectHive}
            style={{ background: 'none', border: 'none', fontSize: 11 }}
          >
            Switch to Aiqbee Cloud
          </button>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {authActionState && (
        <div className="auth-action-banner">
          <div>{authActionMessage}</div>
          {authActionState === 'SignUpRequired' && authActionWebAppUrl && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onClearAuthAction();
                onOpenExternal(authActionWebAppUrl);
              }}
            >
              Open Aiqbee Web App to Sign Up
            </button>
          )}
          <button
            type="button"
            className="link"
            onClick={onClearAuthAction}
          >
            Dismiss
          </button>
        </div>
      )}

      {!isHive && !authActionState && (
        <div className="auth-info">
          Already have a Microsoft or Google work account? Sign in directly — your Aiqbee account will be created automatically on first sign-in.
        </div>
      )}

      <div className="auth-buttons">
        {hasEntra && (
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
        )}

        {hasGoogle && (
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
        )}

        {hasEmail && (
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
        )}
      </div>

      {showEmailForm && hasEmail && (
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

      {!isHive && (
        <>
          <div className="divider" />

          {!showHiveForm ? (
            <div className="auth-buttons">
              <button
                className="auth-button auth-button-hive"
                onClick={() => setShowHiveForm(true)}
                disabled={loading}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 1h10v2H3V1zm0 12h10v2H3v-2zm-2-3h14v2H1v-2zm0-6h14v2H1V4zm1 3h12v2H2V7z" />
                </svg>
                <span>Your Hive Server</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleHiveConnect} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="form-group">
                <label htmlFor="hive-url">Hive Server URL</label>
                <input
                  id="hive-url"
                  type="text"
                  placeholder="hive.yourcompany.com"
                  value={hiveUrl}
                  onChange={(e) => setHiveUrl(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn-primary" disabled={loading || !hiveUrl.trim()} style={{ flex: 1 }}>
                  {loading ? 'Connecting...' : 'Connect'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setShowHiveForm(false); setHiveUrl(''); }}
                  style={{ flex: 0 }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)' }}>
              No account yet?{' '}
            </span>
            <button className="link" onClick={onCreateAccount} style={{ background: 'none', border: 'none' }}>
              Create an email account
            </button>
          </div>
        </>
      )}

      {environment && !isHive && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 4 }}>
          Environment: <span style={{ fontWeight: 600 }}>{environment}</span>
        </div>
      )}
    </div>
  );
}
