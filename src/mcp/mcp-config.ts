import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  servers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

interface McpServerEntry {
  type: 'http';
  url: string;
  [key: string]: unknown;
}

interface ConfigTarget {
  label: string;
  description: string;
  detail: string;
  configPath: string;
  /** VS Code Copilot uses "servers" key instead of "mcpServers" */
  serverKey: 'mcpServers' | 'servers';
}

export async function addMcpConnection(brainId: string, brainName: string, mcpBaseUrl?: string): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      'Please open a folder or workspace before adding an MCP connection.'
    );
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  const targets: ConfigTarget[] = [
    {
      label: '.mcp.json',
      description: 'Claude Code (recommended)',
      detail: 'Project-level MCP config — committed to repo, works with Claude Code',
      configPath: path.join(workspaceRoot, '.mcp.json'),
      serverKey: 'mcpServers',
    },
    {
      label: '.cursor/mcp.json',
      description: 'Cursor',
      detail: 'Project-level MCP config for Cursor AI',
      configPath: path.join(workspaceRoot, '.cursor', 'mcp.json'),
      serverKey: 'mcpServers',
    },
    {
      label: '.vscode/mcp.json',
      description: 'VS Code / GitHub Copilot',
      detail: 'Project-level MCP config for VS Code with Copilot',
      configPath: path.join(workspaceRoot, '.vscode', 'mcp.json'),
      serverKey: 'servers',
    },
    {
      label: '.roo/mcp.json',
      description: 'Roo Code',
      detail: 'Project-level MCP config for Roo Code',
      configPath: path.join(workspaceRoot, '.roo', 'mcp.json'),
      serverKey: 'mcpServers',
    },
  ];

  const target = await vscode.window.showQuickPick(targets, {
    placeHolder: 'Where should the MCP connection be added?',
  });

  if (!target) {
    return;
  }

  const configPath = target.configPath;
  const entryName = `Aiqbee Brain: ${brainName}`;
  let resolvedMcpBaseUrl: string;
  if (mcpBaseUrl) {
    resolvedMcpBaseUrl = mcpBaseUrl.replace(/\/$/, '');
  } else {
    const apiUrl = process.env.VITE_API_URL || 'https://api.aiqbee.com';
    const baseUrl = new URL(apiUrl);
    baseUrl.hostname = baseUrl.hostname.replace(/^api\./, 'mcp.');
    resolvedMcpBaseUrl = baseUrl.toString().replace(/\/$/, '');
  }
  const serverEntry: McpServerEntry = {
    type: 'http',
    url: `${resolvedMcpBaseUrl}/brain/${encodeURIComponent(brainId)}/mcp`,
  };

  try {
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    let config: McpConfig = {};
    try {
      const existing = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(existing);
      if (typeof parsed === 'object' && parsed !== null) {
        config = parsed as McpConfig;
      } else {
        vscode.window.showWarningMessage(`${target.label} contained invalid structure — creating fresh config.`);
      }
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        vscode.window.showWarningMessage(`${target.label} contained malformed JSON — creating fresh config.`);
      }
      // ENOENT (file doesn't exist) is fine — start fresh
    }

    const key = target.serverKey;
    if (!config[key]) {
      (config as any)[key] = {};
    }
    (config[key] as Record<string, McpServerEntry>)[entryName] = serverEntry;

    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    vscode.window.showInformationMessage(
      `MCP connection added for "${brainName}" in ${target.label}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to write MCP config: ${message}`);
  }
}
