// Minimal vscode API mock for unit tests
export const workspace = {
  getConfiguration: () => ({
    get: (_key: string, defaultValue?: string) => defaultValue,
    inspect: () => undefined,
  }),
  workspaceFolders: undefined as any,
  fs: {
    writeFile: async () => {},
    readFile: async () => Buffer.from('{}'),
  },
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file', path }),
  joinPath: (base: any, ...segments: string[]) => ({
    fsPath: [base.fsPath, ...segments].join('/'),
    scheme: 'file',
    path: [base.path, ...segments].join('/'),
  }),
  parse: (value: string) => {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase() ?? 'file';
    return { fsPath: value, scheme, path: value, toString: () => value };
  },
};

export const env = {
  openExternal: async () => true,
  asExternalUri: async (uri: any) => uri,
};

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export enum ViewColumn {
  Active = -1,
  One = 1,
}

/** A fake webview panel that records what it is sent and can be disposed. */
export function createFakeWebviewPanel(viewType: string, title: string) {
  const disposeHandlers: Function[] = [];
  const messageHandlers: Function[] = [];
  const panel = {
    viewType,
    title,
    posted: [] as unknown[],
    revealed: 0,
    disposed: false,
    webview: {
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: (uri: any) => uri,
      postMessage: (message: unknown) => { panel.posted.push(message); return Promise.resolve(true); },
      onDidReceiveMessage: (handler: Function) => { messageHandlers.push(handler); return { dispose: () => {} }; },
      /** Test helper: deliver a message as if the webview sent it. */
      receive: (message: unknown) => Promise.all(messageHandlers.map((h) => h(message))),
    },
    reveal: () => { panel.revealed++; },
    onDidDispose: (handler: Function) => { disposeHandlers.push(handler); return { dispose: () => {} }; },
    dispose: () => {
      if (panel.disposed) { return; }
      panel.disposed = true;
      disposeHandlers.forEach((h) => h());
    },
  };
  return panel;
}

export const window = {
  createWebviewPanel: (viewType: string, title: string, ..._rest: any[]) => createFakeWebviewPanel(viewType, title),
  showInformationMessage: async (..._args: any[]): Promise<any> => undefined,
  showErrorMessage: async (..._args: any[]): Promise<any> => undefined,
  showWarningMessage: async (..._args: any[]): Promise<any> => undefined,
  showQuickPick: async (..._args: any[]): Promise<any> => undefined,
  showInputBox: async (..._args: any[]): Promise<any> => undefined,
  withProgress: async (_options: any, task: (progress: any) => any) => task({ report: () => {} }),
  createOutputChannel: () => ({
    appendLine: () => {},
    append: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
};

export const commands = {
  registerCommand: (_id: string, _handler: (...args: any[]) => any) => ({ dispose: () => {} }),
  executeCommand: async (..._args: any[]): Promise<any> => undefined,
};

export const EventEmitter = class {
  handlers: Function[] = [];
  event = (handler: Function) => {
    this.handlers.push(handler);
    return {
      dispose: () => {
        this.handlers = this.handlers.filter((h) => h !== handler);
      },
    };
  };
  fire(data?: any) {
    [...this.handlers].forEach((h) => h(data));
  }
  dispose() {
    this.handlers = [];
  }
};

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  id?: string;
  description?: string;
  tooltip?: any;
  iconPath?: any;
  contextValue?: string;
  command?: any;
  constructor(public label: string, public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {}
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class MarkdownString {
  value: string;
  constructor(value = '', public supportThemeIcons = false) {
    this.value = value;
  }
  appendMarkdown(text: string) {
    this.value += text;
    return this;
  }
}

export enum SecretStorageKeys {}

export class SecretStorage {
  private data = new Map<string, string>();
  async get(key: string) {
    return this.data.get(key);
  }
  async store(key: string, value: string) {
    this.data.set(key, value);
  }
  async delete(key: string) {
    this.data.delete(key);
  }
}
