import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import App, { initialState, reducer } from './App';
import type { ServerViewModel } from './types';
import { mockPostMessage } from './test-setup';

function server(overrides: Partial<ServerViewModel> = {}): ServerViewModel {
  return {
    id: 'cloud',
    kind: 'cloud',
    label: 'Aiqbee Cloud',
    baseUrl: 'https://api.aiqbee.com',
    status: 'signedOut',
    signedIn: false,
    authProviders: ['entra', 'google', 'email'],
    removable: false,
    managed: false,
    signUpUrl: 'https://app.aiqbee.com/signup',
    ...overrides,
  };
}

function send(command: string, payload: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { command, payload } }));
  });
}

describe('App', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
  });

  it('asks for state on mount and shows the Account, Help and Prompts tabs', () => {
    render(<App />);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'ready' });

    send('serversChanged', { servers: [server()], environment: 'production' });

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Account', 'Help', 'Prompts']);
    expect(screen.queryByRole('tab', { name: 'Brains' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Aiqbee Cloud' })).toBeInTheDocument();
  });

  it('opens the email form for the server the extension names', () => {
    render(<App />);
    send('serversChanged', { servers: [server(), server({ id: 'hive-1', kind: 'hive', label: 'Hive', authProviders: ['email'] })] });
    fireEvent.click(screen.getByRole('tab', { name: 'Help' }));

    send('showEmailSignIn', { serverId: 'hive-1' });

    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('posts sign-in with the right serverId', () => {
    render(<App />);
    send('serversChanged', { servers: [server(), server({ id: 'hive-1', kind: 'hive', label: 'Hive', authProviders: ['entra'] })] });

    const hive = screen.getByRole('region', { name: 'Hive' });
    fireEvent.click(hive.querySelector('.auth-button-microsoft')!);

    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'signIn', payload: { serverId: 'hive-1', provider: 'entra' } });
  });
});

describe('reducer', () => {
  it('clears banners and the email form for servers that are now signed in', () => {
    let state = reducer(initialState, { type: 'SERVERS_CHANGED', servers: [server()] });
    state = reducer(state, { type: 'SHOW_EMAIL_FORM', serverId: 'cloud' });
    state = reducer(state, { type: 'ERROR', serverId: 'cloud', message: 'bad password' });
    state = reducer(state, { type: 'AUTH_ACTION_REQUIRED', serverId: 'cloud', action: { state: 'PendingApproval', message: 'wait' } });

    state = reducer(state, { type: 'SERVERS_CHANGED', servers: [server({ status: 'connected', signedIn: true })] });

    expect(state.emailFormFor).toBeUndefined();
    expect(state.errors).toEqual({});
    expect(state.authActions).toEqual({});
  });

  it('keeps an error for a server that is still signed out', () => {
    let state = reducer(initialState, { type: 'ERROR', serverId: 'cloud', message: 'bad password' });
    state = reducer(state, { type: 'SERVERS_CHANGED', servers: [server()] });
    expect(state.errors).toEqual({ cloud: 'bad password' });
  });

  it('dismisses per server or the general error', () => {
    let state = reducer(initialState, { type: 'ERROR', serverId: 'cloud', message: 'x' });
    state = reducer(state, { type: 'ERROR', message: 'general' });

    state = reducer(state, { type: 'DISMISS', serverId: 'cloud' });
    expect(state.errors).toEqual({});
    expect(state.generalError).toBe('general');

    state = reducer(state, { type: 'DISMISS' });
    expect(state.generalError).toBeUndefined();
  });
});
