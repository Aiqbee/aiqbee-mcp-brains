import { useCallback, useEffect, useReducer, useState } from 'react';
import { useVsCode, useMessageListener } from './hooks/useVsCode';
import { AccountPage } from './pages/AccountPage';
import { HelpPage } from './pages/HelpPage';
import { PromptsPage } from './pages/PromptsPage';
import type { AuthAction, ServerViewModel } from './types';

export interface AppState {
  loaded: boolean;
  servers: ServerViewModel[];
  environment?: string;
  /** Server whose email sign-in form is open. */
  emailFormFor?: string;
  authActions: Record<string, AuthAction>;
  errors: Record<string, string>;
  generalError?: string;
}

export type AppAction =
  | { type: 'SERVERS_CHANGED'; servers: ServerViewModel[]; environment?: string }
  | { type: 'SHOW_EMAIL_FORM'; serverId: string }
  | { type: 'TOGGLE_EMAIL_FORM'; serverId: string }
  | { type: 'AUTH_ACTION_REQUIRED'; serverId: string; action: AuthAction }
  | { type: 'ERROR'; serverId?: string; message: string }
  | { type: 'DISMISS'; serverId?: string };

export const initialState: AppState = { loaded: false, servers: [], authActions: {}, errors: {} };

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) { return record; }
  const { [key]: _removed, ...rest } = record;
  return rest;
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SERVERS_CHANGED': {
      // A server that is now signed in (or gone) no longer needs its banners or form.
      const pending = new Set(
        action.servers.filter((s) => s.status === 'signedOut' || s.status === 'authExpired').map((s) => s.id),
      );
      const keep = <T,>(record: Record<string, T>) =>
        Object.fromEntries(Object.entries(record).filter(([id]) => pending.has(id)));
      return {
        ...state,
        loaded: true,
        servers: action.servers,
        environment: action.environment ?? state.environment,
        emailFormFor: state.emailFormFor && pending.has(state.emailFormFor) ? state.emailFormFor : undefined,
        authActions: keep(state.authActions),
        errors: keep(state.errors),
      };
    }
    case 'SHOW_EMAIL_FORM':
      return { ...state, emailFormFor: action.serverId };
    case 'TOGGLE_EMAIL_FORM':
      return { ...state, emailFormFor: state.emailFormFor === action.serverId ? undefined : action.serverId };
    case 'AUTH_ACTION_REQUIRED':
      return { ...state, authActions: { ...state.authActions, [action.serverId]: action.action } };
    case 'ERROR':
      return action.serverId
        ? { ...state, errors: { ...state.errors, [action.serverId]: action.message } }
        : { ...state, generalError: action.message };
    case 'DISMISS':
      return action.serverId
        ? { ...state, authActions: without(state.authActions, action.serverId), errors: without(state.errors, action.serverId) }
        : { ...state, generalError: undefined };
    default:
      return state;
  }
}

type Tab = 'account' | 'help' | 'prompts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'help', label: 'Help' },
  { id: 'prompts', label: 'Prompts' },
];

export default function App() {
  const { postMessage } = useVsCode();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [activeTab, setActiveTab] = useState<Tab>('account');

  useMessageListener(
    useCallback((event: MessageEvent) => {
      const message = event.data;
      if (!message || typeof message.command !== 'string') {
        return;
      }
      switch (message.command) {
        case 'serversChanged':
          dispatch({ type: 'SERVERS_CHANGED', servers: message.payload.servers, environment: message.payload.environment });
          break;
        case 'showEmailSignIn':
          setActiveTab('account');
          dispatch({ type: 'SHOW_EMAIL_FORM', serverId: message.payload.serverId });
          break;
        case 'authActionRequired':
          dispatch({
            type: 'AUTH_ACTION_REQUIRED',
            serverId: message.payload.serverId,
            action: { state: message.payload.state, message: message.payload.message, signUpUrl: message.payload.signUpUrl },
          });
          break;
        case 'error':
          dispatch({ type: 'ERROR', serverId: message.payload.serverId, message: message.payload.message });
          break;
      }
    }, []),
  );

  useEffect(() => {
    postMessage({ command: 'ready' });
  }, [postMessage]);

  if (!state.loaded) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="tab-bar" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {activeTab === 'account' && (
          <AccountPage
            servers={state.servers}
            environment={state.environment}
            emailFormFor={state.emailFormFor}
            authActions={state.authActions}
            errors={state.errors}
            generalError={state.generalError}
            onSignIn={(serverId, provider) => postMessage({ command: 'signIn', payload: { serverId, provider } })}
            onToggleEmailForm={(serverId) => dispatch({ type: 'TOGGLE_EMAIL_FORM', serverId })}
            onSignInEmail={(serverId, email, password) =>
              postMessage({ command: 'signInEmail', payload: { serverId, email, password } })}
            onCancelSignIn={(serverId) => postMessage({ command: 'cancelSignIn', payload: { serverId } })}
            onSignOut={(serverId) => postMessage({ command: 'signOut', payload: { serverId } })}
            onRemove={(serverId) => postMessage({ command: 'removeServer', payload: { serverId } })}
            onAddServer={(url) => postMessage({ command: 'addServer', payload: { url } })}
            onOpenExternal={(url) => postMessage({ command: 'openExternal', payload: { url } })}
            onDismiss={(serverId) => dispatch({ type: 'DISMISS', serverId })}
          />
        )}
        {activeTab === 'help' && <HelpPage />}
        {activeTab === 'prompts' && <PromptsPage />}
      </div>
    </div>
  );
}
