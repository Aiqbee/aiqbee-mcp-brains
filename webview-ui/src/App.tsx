import { useCallback, useEffect, useReducer, useState } from 'react';
import { useVsCode, useMessageListener } from './hooks/useVsCode';
import { LoginPage } from './pages/LoginPage';
import { SignUpPage } from './pages/SignUpPage';
import { BrainsPage } from './pages/BrainsPage';
import { HelpPage } from './pages/HelpPage';
import { PromptsPage } from './pages/PromptsPage';

interface UserDto {
  id: string;
  givenName: string;
  familyName: string;
  email: string;
}

interface AppState {
  page: 'login' | 'signup' | 'brains';
  authenticated: boolean;
  user?: UserDto;
  environment?: string;
  loading: boolean;
  error?: string;
  verificationEmail?: string;
  backendType: 'cloud' | 'hive';
  hiveLabel?: string;
  authProviders: string[];
}

type AppAction =
  | { type: 'AUTH_STATE'; authenticated: boolean; user?: UserDto; environment?: string }
  | { type: 'SET_PAGE'; page: AppState['page'] }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'EMAIL_VERIFICATION_REQUIRED'; email: string }
  | { type: 'CONNECTION_CHANGED'; backendType: 'cloud' | 'hive'; label: string; authProviders: string[] };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'AUTH_STATE':
      return {
        ...state,
        authenticated: action.authenticated,
        user: action.user,
        environment: action.environment ?? state.environment,
        page: action.authenticated ? 'brains' : 'login',
        loading: false,
        error: undefined,
      };
    case 'SET_PAGE':
      return { ...state, page: action.page, error: undefined, verificationEmail: undefined };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: undefined };
    case 'EMAIL_VERIFICATION_REQUIRED':
      return { ...state, verificationEmail: action.email, loading: false };
    case 'CONNECTION_CHANGED':
      return {
        ...state,
        backendType: action.backendType,
        hiveLabel: action.backendType === 'hive' ? action.label : undefined,
        authProviders: action.authProviders,
        error: undefined,
      };
    default:
      return state;
  }
}

type Tab = 'brains' | 'help' | 'prompts';

export default function App() {
  const { postMessage } = useVsCode();
  const [state, dispatch] = useReducer(reducer, {
    page: 'login',
    authenticated: false,
    loading: true,
    backendType: 'cloud',
    authProviders: ['entra', 'google', 'email'],
  });
  const [activeTab, setActiveTab] = useState<Tab>('brains');

  // Listen for messages from extension host
  useMessageListener(
    useCallback((event: MessageEvent) => {
      const message = event.data;
      if (!message || typeof message.command !== 'string') {
        return;
      }
      switch (message.command) {
        case 'authStateChanged':
          dispatch({
            type: 'AUTH_STATE',
            authenticated: message.payload.authenticated,
            user: message.payload.user,
            environment: message.payload.environment,
          });
          break;
        case 'loading':
          dispatch({ type: 'SET_LOADING', loading: message.payload.loading });
          break;
        case 'error':
          dispatch({ type: 'SET_ERROR', error: message.payload.message });
          break;
        case 'emailVerificationRequired':
          dispatch({ type: 'EMAIL_VERIFICATION_REQUIRED', email: message.payload.email });
          break;
        case 'connectionChanged':
          dispatch({
            type: 'CONNECTION_CHANGED',
            backendType: message.payload.backendType,
            label: message.payload.label,
            authProviders: message.payload.authProviders,
          });
          break;
      }
    }, []),
  );

  // Request auth state on mount
  useEffect(() => {
    postMessage({ command: 'ready' });
  }, [postMessage]);

  const goToSignUp = useCallback(() => dispatch({ type: 'SET_PAGE', page: 'signup' }), []);

  if (state.loading && !state.authenticated && state.page === 'login') {
    return (
      <>
        <div className="loading-container">
          <div className="spinner" />
          <span>Loading...</span>
        </div>
      </>
    );
  }

  // Pre-auth pages (no tabs)
  if (state.page === 'login') {
    return (
      <>
      <LoginPage
        loading={state.loading}
        error={state.error}
        environment={state.environment}
        backendType={state.backendType}
        hiveLabel={state.hiveLabel}
        authProviders={state.authProviders}
        onSignInMicrosoft={() => postMessage({ command: 'signInMicrosoft' })}
        onSignInGoogle={() => postMessage({ command: 'signInGoogle' })}
        onSignInEmail={(email, password) =>
          postMessage({ command: 'signInEmail', payload: { email, password } })
        }
        onCreateAccount={goToSignUp}
        onConnectToHive={(url) => postMessage({ command: 'connectToHive', payload: { url } })}
        onDisconnectHive={() => postMessage({ command: 'disconnectHive' })}
      />
      </>
    );
  }

  if (state.page === 'signup') {
    return (
      <>
      <SignUpPage
        loading={state.loading}
        error={state.error}
        verificationEmail={state.verificationEmail}
        onRegister={(data) => postMessage({ command: 'register', payload: data })}
        onBackToLogin={() => {
          dispatch({ type: 'SET_PAGE', page: 'login' });
          dispatch({ type: 'CLEAR_ERROR' });
        }}
      />
      </>
    );
  }

  // Authenticated: show tab bar + content
  return (
    <div className="app-shell">
      {state.backendType === 'hive' && state.hiveLabel && (
        <div className="hive-banner">
          {state.hiveLabel}
        </div>
      )}
      <div className="tab-bar">
        <button
          type="button"
          className={`tab-btn${activeTab === 'brains' ? ' active' : ''}`}
          onClick={() => setActiveTab('brains')}
        >
          Brains
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'help' ? ' active' : ''}`}
          onClick={() => setActiveTab('help')}
        >
          Help
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'prompts' ? ' active' : ''}`}
          onClick={() => setActiveTab('prompts')}
        >
          Prompts
        </button>
      </div>
      <div className="tab-content">
        {activeTab === 'brains' && (
          <BrainsPage
            user={state.user}
            onSignOut={() => postMessage({ command: 'signOut' })}
          />
        )}
        {activeTab === 'help' && <HelpPage />}
        {activeTab === 'prompts' && <PromptsPage />}
      </div>
    </div>
  );
}
