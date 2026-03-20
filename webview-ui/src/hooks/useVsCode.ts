import { useCallback, useEffect, useRef } from 'react';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

export function useVsCode() {
  return {
    postMessage: useCallback((message: unknown) => {
      vscodeApi.postMessage(message);
    }, []),
    getState: useCallback(() => vscodeApi.getState(), []),
    setState: useCallback((state: unknown) => vscodeApi.setState(state), []),
  };
}

export function useMessageListener(handler: (message: MessageEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      handlerRef.current(event);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
}
