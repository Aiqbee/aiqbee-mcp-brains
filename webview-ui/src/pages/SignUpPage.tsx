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
  onRegister: (data: EmailRegisterDto) => void;
  onBackToLogin: () => void;
}

export function SignUpPage({ loading, error, onRegister, onBackToLogin }: SignUpPageProps) {
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

    onRegister({
      email: form.email,
      password: form.password,
      givenName: form.givenName,
      familyName: form.familyName,
      tenantName: form.tenantName,
      jobTitle: form.jobTitle || undefined,
    });
  };

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
        <span className="page-title">Create Account</span>
        <button className="link" onClick={onBackToLogin} style={{ background: 'none', border: 'none' }}>
          Back to Sign In
        </button>
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
            placeholder="Min. 8 characters"
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
