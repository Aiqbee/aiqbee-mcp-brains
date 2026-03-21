import '@testing-library/jest-dom/vitest';

// Mock the VS Code webview API
const mockPostMessage = vi.fn();
const mockGetState = vi.fn().mockReturnValue(undefined);
const mockSetState = vi.fn();

(window as any).acquireVsCodeApi = () => ({
  postMessage: mockPostMessage,
  getState: mockGetState,
  setState: mockSetState,
});

// Expose mocks for tests to access
export { mockPostMessage, mockGetState, mockSetState };
