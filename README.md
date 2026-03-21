# Aiqbee MCP Brains

Browse, visualise, and manage [Aiqbee](https://www.aiqbee.com) knowledge brains directly from VS Code. One-click MCP connections for **Claude Code**, **Cursor**, **Windsurf**, and other AI coding assistants.

## Features

### Brain Management
- **Browse your brains** — compact sidebar list with neuron, type, and synapse counts
- **Create new brains** from templates or blank
- **Sign in** with Microsoft Entra, Google, or email/password

### MCP Connections
- **One-click setup** — writes connection config to `.claude/settings.json` or `.mcp.json`
- Works with Claude Code, Cursor, Windsurf, and any MCP-compatible tool
- No manual config editing required

### Brain Graph Visualisation
- **Force-directed graph** opens in the main editor panel
- Nodes coloured by neuron type with collapsible legend
- Click any node to view neuron details
- **Edit neurons** in-place (Owner/ReadWrite access)
- Brain statistics header showing neuron, type, and synapse counts

### Developer Help & Prompts
- **Help tab** with FAQ-style guide on MCP setup, brain usage, and available tools
- **Prompts tab** with 13 ready-to-copy prompts for common brain operations
- Covers project scanning, knowledge capture, health checks, access management, and more

## Installation

### From VS Code Marketplace

Search for **"Aiqbee MCP Brains"** in the Extensions view (`Ctrl+Shift+X`) and click Install.

### From Source

```bash
git clone https://github.com/aiqbee/aiqbee-mcp-brains.git
cd aiqbee-mcp-brains
npm install
cd webview-ui && npm install && cd ..
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

## Usage

1. Click the **Aiqbee** icon in the Activity Bar (left sidebar).
2. **Sign in** with your Aiqbee account.
3. Your brains appear in a compact list.
4. Click the **graph icon** to visualise a brain's knowledge structure.
5. Click the **+** button to add an MCP connection to your project.
6. Use the **Help** and **Prompts** tabs for guidance and ready-to-use prompts.

## Commands

| Command | Description |
|---|---|
| `Aiqbee: Open Brain Manager` | Focus the sidebar panel |
| `Aiqbee: Sign In` | Sign in to Aiqbee |
| `Aiqbee: Sign Out` | Sign out |
| `Aiqbee: Refresh Brains` | Refresh the brain list |
| `Aiqbee: Add MCP Connection` | Add an MCP connection for a brain |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `aiqbee.environment` | `development` | API environment (`development` or `production`) |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

External contributors must sign our [Contributor License Agreement](CLA.md) — the CLA bot will prompt you on your first PR.

## License

[MIT](LICENSE) — Copyright (c) 2026 Aiqbee Limited
