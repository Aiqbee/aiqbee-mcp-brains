import { useState } from 'react';

interface EmailRegisterDto {
  email: string;
  password: string;
  givenName: string;
  familyName: string;
  tenantName: string;
  jobTitle?: string;
}

interface SignUpPageProps {
  loading: boolean;
  error?: string;
  verificationEmail?: string;
  onRegister: (data: EmailRegisterDto) => void;
  onBackToLogin: () => void;
}

export function SignUpPage({ loading, error, verificationEmail, onRegister, onBackToLogin }: SignUpPageProps) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    givenName: '',
    familyName: '',
    tenantName: '',
    jobTitle: '',
  });
  const [validationError, setValidationError] = useState('');

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setValidationError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    if (form.password.length < 8) {
      setValidationError('Password must be at least 8 characters');
      return;
    }

    if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setValidationError('Password must contain at least one letter and one number');
      return;
    }

    onRegister({
      email: form.email,
      password: form.password,
      givenName: form.givenName,
      familyName: form.familyName,
      tenantName: form.tenantName,
      jobTitle: form.jobTitle || undefined,
    });
  };

  // Show verification success screen
  if (verificationEmail) {
    return (
      <div className="page">
        <div className="welcome">
          <svg width="40" height="40" viewBox="0 0 16 16" fill="var(--vscode-charts-green, #4EC9B0)">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm3.354 5.354l-4 4a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7 9.293l3.646-3.647a.5.5 0 0 1 .708.708z" />
          </svg>
          <div className="welcome-title">Check Your Email</div>
          <div className="welcome-desc">
            We've sent a verification link to <strong>{verificationEmail}</strong>.
            Please click the link in the email to activate your account, then return here to sign in.
          </div>
          <div className="welcome-actions">
            <button type="button" className="btn-primary" onClick={onBackToLogin}>
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isValid =
    form.email &&
    form.password &&
    form.confirmPassword &&
    form.givenName &&
    form.familyName &&
    form.tenantName;

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Create Email Account</span>
        <button className="link" onClick={onBackToLogin} style={{ background: 'none', border: 'none' }}>
          Back to Sign In
        </button>
      </div>

      <div className="auth-info">
        Create an Aiqbee account using your email address. If you have a Microsoft or Google work account, you can sign in directly from the login page instead — no registration needed.
      </div>

      {(error || validationError) && (
        <div className="error-message">{validationError || error}</div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="givenName">First Name</label>
            <input
              id="givenName"
              type="text"
              value={form.givenName}
              onChange={(e) => updateField('givenName', e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="familyName">Last Name</label>
            <input
              id="familyName"
              type="text"
              value={form.familyName}
              onChange={(e) => updateField('familyName', e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="signupEmail">Email</label>
          <input
            id="signupEmail"
            type="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="tenantName">Organisation Name</label>
          <input
            id="tenantName"
            type="text"
            placeholder="Your company or team name"
            value={form.tenantName}
            onChange={(e) => updateField('tenantName', e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="jobTitle">Job Title (optional)</label>
          <input
            id="jobTitle"
            type="text"
            placeholder="e.g. Software Engineer"
            value={form.jobTitle}
            onChange={(e) => updateField('jobTitle', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="signupPassword">Password</label>
          <input
            id="signupPassword"
            type="password"
            placeholder="Min. 8 chars, letters and numbers"
            value={form.password}
            onChange={(e) => updateField('password', e.target.value)}
            required
            minLength={8}
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => updateField('confirmPassword', e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading || !isValid}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}
