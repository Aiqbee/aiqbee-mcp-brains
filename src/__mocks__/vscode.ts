// Minimal vscode API mock for unit tests
export const workspace = {
  getConfiguration: () => ({
    get: (key: string, defaultValue?: string) => defaultValue,
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
  parse: (value: string) => ({ fsPath: value, scheme: 'https', path: value }),
};

export const env = {
  openExternal: async () => true,
  asExternalUri: async (uri: any) => uri,
};

export const window = {
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showQuickPick: async () => undefined,
};

export const EventEmitter = class {
  private handlers: Function[] = [];
  event = (handler: Function) => {
    this.handlers.push(handler);
    return { dispose: () => {} };
  };
  fire(data: any) {
    this.handlers.forEach((h) => h(data));
  }
  dispose() {
    this.handlers = [];
  }
};

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
