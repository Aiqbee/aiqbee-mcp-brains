import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

interface McpServerEntry {
  command: string;
  args: string[];
}

export async function addMcpConnection(brainId: string, brainName: string): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      'Please open a folder or workspace before adding an MCP connection.'
    );
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Let user choose the config target
  const target = await vscode.window.showQuickPick(
    [
      {
        label: '.claude/settings.json',
        description: 'Claude Code',
        detail: 'Add MCP config to the Claude Code project settings',
        configPath: path.join(workspaceRoot, '.claude', 'settings.json'),
      },
      {
        label: '.mcp.json',
        description: 'Generic MCP (Cursor, etc.)',
        detail: 'Add MCP config to a generic .mcp.json file at the workspace root',
        configPath: path.join(workspaceRoot, '.mcp.json'),
      },
    ],
    {
      placeHolder: 'Where should the MCP connection be added?',
    }
  );

  if (!target) {
    return; // User cancelled
  }

  const configPath = target.configPath;
  const serverKey = `Aiqbee Brain: ${brainName}`;
  const serverEntry: McpServerEntry = {
    command: 'npx',
    args: ['-y', '@anthropic-ai/claude-code-mcp-server', `--brain-id=${brainId}`],
  };

  try {
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    // Read existing config or start fresh
    let config: McpConfig = {};
    try {
      const existing = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(existing) as McpConfig;
    } catch {
      // File doesn't exist or invalid JSON — start fresh
    }

    // Add/update the MCP server entry
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    config.mcpServers[serverKey] = serverEntry;

    // Write back
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    vscode.window.showInformationMessage(
      `MCP connection added for "${brainName}" in ${target.label}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to write MCP config: ${message}`);
  }
}
