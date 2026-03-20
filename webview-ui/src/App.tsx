import { useCallback, useEffect, useReducer } from 'react';
import { useVsCode, useMessageListener } from './hooks/useVsCode';
import { LoginPage } from './pages/LoginPage';
import { SignUpPage } from './pages/SignUpPage';
import { BrainsPage } from './pages/BrainsPage';

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
}

type AppAction =
  | { type: 'AUTH_STATE'; authenticated: boolean; user?: UserDto; environment?: string }
  | { type: 'SET_PAGE'; page: AppState['page'] }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' };

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
      return { ...state, page: action.page, error: undefined };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: undefined };
    default:
      return state;
  }
}

export default function App() {
  const { postMessage } = useVsCode();
  const [state, dispatch] = useReducer(reducer, {
    page: 'login',
    authenticated: false,
    loading: true,
  });

  // Listen for messages from extension host
  useMessageListener(
    useCallback((event: MessageEvent) => {
      const message = event.data;
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
      }
    }, []),
  );

  // Request auth state on mount
  useEffect(() => {
    postMessage({ command: 'ready' });
  }, [postMessage]);

  const goToSignUp = useCallback(() => dispatch({ type: 'SET_PAGE', page: 'signup' }), []);
  const goToLogin = useCallback(() => dispatch({ type: 'SET_PAGE', page: 'login' }), []);

  if (state.loading && !state.authenticated && state.page === 'login') {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading...</span>
      </div>
    );
  }

  switch (state.page) {
    case 'login':
      return (
        <LoginPage
          loading={state.loading}
          error={state.error}
          environment={state.environment}
          onSignInMicrosoft={() => postMessage({ command: 'signInMicrosoft' })}
          onSignInGoogle={() => postMessage({ command: 'signInGoogle' })}
          onSignInEmail={(email, password) =>
            postMessage({ command: 'signInEmail', payload: { email, password } })
          }
          onCreateAccount={goToSignUp}
        />
      );
    case 'signup':
      return (
        <SignUpPage
          loading={state.loading}
          error={state.error}
          onRegister={(data) => postMessage({ command: 'register', payload: data })}
          onBackToLogin={goToLogin}
        />
      );
    case 'brains':
      return (
        <BrainsPage
          user={state.user}
          onSignOut={() => postMessage({ command: 'signOut' })}
        />
      );
  }
}
