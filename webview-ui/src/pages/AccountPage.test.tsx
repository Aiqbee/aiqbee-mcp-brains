import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountPage } from './AccountPage';
import type { ServerViewModel } from '../types';

const cloud: ServerViewModel = {
  id: 'cloud',
  kind: 'cloud',
  label: 'Aiqbee Cloud',
  baseUrl: 'https://api.aiqbee.com',
  status: 'signedOut',
  signedIn: false,
  authProviders: ['entra'],
  removable: false,
  managed: false,
};

function renderPage(servers: ServerViewModel[]) {
  const props = {
    servers,
    authActions: {},
    errors: {},
    onSignIn: vi.fn(),
    onToggleEmailForm: vi.fn(),
    onSignInEmail: vi.fn(),
    onCancelSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onRemove: vi.fn(),
    onAddServer: vi.fn(),
    onOpenExternal: vi.fn(),
    onDismiss: vi.fn(),
  };
  render(<AccountPage {...props} />);
  return props;
}

describe('AccountPage', () => {
  it('shows a welcome when no server is signed in', () => {
    renderPage([cloud]);
    expect(screen.getByText('Aiqbee Brain Manager')).toBeInTheDocument();
  });

  it('hides the welcome once any server is signed in', () => {
    renderPage([{ ...cloud, status: 'connected', signedIn: true }]);
    expect(screen.queryByText('Aiqbee Brain Manager')).toBeNull();
  });

  it('renders one card per server', () => {
    renderPage([cloud, { ...cloud, id: 'hive-1', kind: 'hive', label: 'Team Hive' }]);
    expect(screen.getAllByRole('region')).toHaveLength(2);
  });

  it('adds a Hive Server by URL', () => {
    const { onAddServer } = renderPage([cloud]);

    fireEvent.change(screen.getByLabelText('Add a Hive Server'), { target: { value: ' hive.example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddServer).toHaveBeenCalledWith('hive.example.com');
    expect(screen.getByLabelText('Add a Hive Server')).toHaveValue('');
  });

  it('passes the server id to card actions', () => {
    const { onSignIn } = renderPage([cloud]);
    fireEvent.click(screen.getByText('Sign in with Microsoft'));
    expect(onSignIn).toHaveBeenCalledWith('cloud', 'entra');
  });
});
