import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as vscode from 'vscode';

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn().mockResolvedValue(undefined);

vi.mock('fs/promises', () => ({
  mkdir: (...args: any[]) => mockMkdir(...args),
  readFile: (...args: any[]) => mockReadFile(...args),
  writeFile: (...args: any[]) => mockWriteFile(...args),
}));

const { addMcpConnection } = await import('./mcp-config.js');

describe('addMcpConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows warning when no workspace is open', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    const spy = vi.spyOn(vscode.window, 'showWarningMessage');

    await addMcpConnection('brain-1', 'Test Brain');

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('open a folder'));
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('does nothing when user cancels quick pick', async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: '/workspace' } },
    ];
    vi.spyOn(vscode.window, 'showQuickPick' as any).mockResolvedValue(undefined);

    await addMcpConnection('brain-1', 'Test Brain');

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('creates .mcp.json with mcpServers key for Claude Code', async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: '/workspace' } },
    ];
    vi.spyOn(vscode.window, 'showQuickPick' as any).mockResolvedValue({
      label: '.mcp.json',
      configPath: '/workspace/.mcp.json',
      serverKey: 'mcpServers',
    });
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    await addMcpConnection('brain-123', 'My Brain');

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const [filePath, content] = mockWriteFile.mock.calls[0];
    expect(filePath).toBe('/workspace/.mcp.json');

    const parsed = JSON.parse(content);
    expect(parsed.mcpServers['Aiqbee Brain: My Brain']).toEqual({
      command: 'npx',
      args: ['-y', '@anthropic-ai/claude-code-mcp-server', '--brain-id=brain-123'],
    });
  });

  it('creates .vscode/mcp.json with servers key for VS Code Copilot', async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: '/workspace' } },
    ];
    vi.spyOn(vscode.window, 'showQuickPick' as any).mockResolvedValue({
      label: '.vscode/mcp.json',
      configPath: '/workspace/.vscode/mcp.json',
      serverKey: 'servers',
    });
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    await addMcpConnection('brain-456', 'Dev Brain');

    const [, content] = mockWriteFile.mock.calls[0];
    const parsed = JSON.parse(content);

    // VS Code uses "servers" not "mcpServers"
    expect(parsed.servers['Aiqbee Brain: Dev Brain']).toBeDefined();
    expect(parsed.mcpServers).toBeUndefined();
  });

  it('creates .cursor/mcp.json for Cursor', async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: '/workspace' } },
    ];
    vi.spyOn(vscode.window, 'showQuickPick' as any).mockResolvedValue({
      label: '.cursor/mcp.json',
      configPath: '/workspace/.cursor/mcp.json',
      serverKey: 'mcpServers',
    });
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    await addMcpConnection('brain-789', 'Cursor Brain');

    const [filePath, content] = mockWriteFile.mock.calls[0];
    expect(filePath).toBe('/workspace/.cursor/mcp.json');
    const parsed = JSON.parse(content);
    expect(parsed.mcpServers['Aiqbee Brain: Cursor Brain']).toBeDefined();
  });

  it('preserves existing config entries', async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: '/workspace' } },
    ];
    vi.spyOn(vscode.window, 'showQuickPick' as any).mockResolvedValue({
      label: '.mcp.json',
      configPath: '/workspace/.mcp.json',
      serverKey: 'mcpServers',
    });

    const existingConfig = {
      mcpServers: {
        'Other Server': { command: 'node', args: ['server.js'] },
      },
    };
    mockReadFile.mockResolvedValueOnce(JSON.stringify(existingConfig));

    await addMcpConnection('brain-456', 'Dev Brain');

    const [, content] = mockWriteFile.mock.calls[0];
    const parsed = JSON.parse(content);

    expect(parsed.mcpServers['Other Server']).toBeDefined();
    expect(parsed.mcpServers['Aiqbee Brain: Dev Brain']).toBeDefined();
  });

  it('shows error message on write failure', async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: '/workspace' } },
    ];
    vi.spyOn(vscode.window, 'showQuickPick' as any).mockResolvedValue({
      label: '.mcp.json',
      configPath: '/workspace/.mcp.json',
      serverKey: 'mcpServers',
    });
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    mockWriteFile.mockRejectedValueOnce(new Error('Permission denied'));

    const spy = vi.spyOn(vscode.window, 'showErrorMessage');

    await addMcpConnection('brain-1', 'Test');

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
  });
});
