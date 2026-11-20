import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServerCard } from './ServerCard';
import type { ServerViewModel } from '../types';

function server(overrides: Partial<ServerViewModel> = {}): ServerViewModel {
  return {
    id: 'hive-1',
    kind: 'hive',
    label: 'Team Hive',
    baseUrl: 'https://hive.example.com',
    status: 'signedOut',
    signedIn: false,
    authProviders: ['entra', 'google'],
    removable: true,
    managed: false,
    ...overrides,
  };
}

function renderCard(overrides: Partial<ServerViewModel> = {}, props: Partial<Parameters<typeof ServerCard>[0]> = {}) {
  const handlers = {
    onSignIn: vi.fn(),
    onToggleEmailForm: vi.fn(),
    onSignInEmail: vi.fn(),
    onCancelSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onRemove: vi.fn(),
    onOpenExternal: vi.fn(),
    onDismiss: vi.fn(),
  };
  render(<ServerCard server={server(overrides)} emailFormOpen={false} {...handlers} {...props} />);
  return handlers;
}

describe('ServerCard', () => {
  it('offers only the sign-in methods the server supports', () => {
    const { onSignIn } = renderCard();

    expect(screen.getByText('Sign in with Microsoft')).toBeInTheDocument();
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    expect(screen.queryByText('Sign in with Email')).toBeNull();

    fireEvent.click(screen.getByText('Sign in with Google'));
    expect(onSignIn).toHaveBeenCalledWith('google');
  });

  it('shows the signed-in user and a sign-out button when connected', () => {
    const { onSignOut } = renderCard({
      status: 'connected',
      signedIn: true,
      user: { givenName: 'Ada', familyName: 'L', email: 'ada@example.com' },
    });

    expect(screen.getByText(/Signed in as Ada L \(ada@example.com\)/)).toBeInTheDocument();
    expect(screen.queryByText('Sign in with Microsoft')).toBeNull();
    fireEvent.click(screen.getByText('Sign Out'));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('keeps the session controls when offline and shows why', () => {
    renderCard({ status: 'offline', signedIn: true, statusMessage: 'Could not reach Team Hive.' });

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('Could not reach Team Hive.')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('offers sign-in, not sign-out, for a signed-out server that is offline', () => {
    renderCard({ status: 'offline', signedIn: false, statusMessage: 'Could not reach Team Hive.' });

    expect(screen.getByText('Sign in with Microsoft')).toBeInTheDocument();
    expect(screen.queryByText('Sign Out')).toBeNull();
  });

  it('explains a server with no supported sign-in method', () => {
    renderCard({ status: 'unsupportedAuth', authProviders: [] });

    expect(screen.getByText(/no sign-in method the extension supports/)).toBeInTheDocument();
    expect(screen.queryByText(/Sign in with/)).toBeNull();
  });

  it('offers cancel while signing in', () => {
    const { onCancelSignIn } = renderCard({ status: 'signingIn' });

    fireEvent.click(screen.getByText('Cancel Sign In'));
    expect(onCancelSignIn).toHaveBeenCalled();
  });

  it('submits the email form', () => {
    const { onSignInEmail } = renderCard({ authProviders: ['email'] }, { emailFormOpen: true });

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(onSignInEmail).toHaveBeenCalledWith('a@b.c', 'pw');
  });

  it('shows the sign-up action for a cloud account that does not exist yet', () => {
    const { onOpenExternal, onDismiss } = renderCard(
      { kind: 'cloud', signUpUrl: 'https://app.aiqbee.com/signup' },
      { authAction: { state: 'SignUpRequired', message: 'No account found.', signUpUrl: 'https://app.aiqbee.com/signup' } },
    );

    fireEvent.click(screen.getByText('Sign up for Aiqbee'));

    expect(onDismiss).toHaveBeenCalled();
    expect(onOpenExternal).toHaveBeenCalledWith('https://app.aiqbee.com/signup');
  });

  it('offers Remove for a user-added server', () => {
    const { onRemove } = renderCard();
    fireEvent.click(screen.getByText('Remove'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('marks a settings-managed server and hides Remove', () => {
    renderCard({ removable: false, managed: true });
    expect(screen.queryByText('Remove')).toBeNull();
    expect(screen.getByText(/Managed by the aiqbee.servers setting/)).toBeInTheDocument();
  });
});
