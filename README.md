<p align="center">
  <img src="media/aiqbee-logo.png" alt="Aiqbee" height="48" />
</p>

<h1 align="center">Aiqbee MCP Brains</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=aiqbee.aiqbee-mcp-brains"><img src="https://img.shields.io/visual-studio-marketplace/v/aiqbee.aiqbee-mcp-brains?label=VS%20Code%20Marketplace&color=A972B8" alt="VS Code Marketplace Version" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=aiqbee.aiqbee-mcp-brains"><img src="https://img.shields.io/visual-studio-marketplace/i/aiqbee.aiqbee-mcp-brains?color=FF6B3D" alt="Installs" /></a>
  <a href="https://github.com/aiqbee/aiqbee-mcp-brains/blob/master/LICENSE"><img src="https://img.shields.io/github/license/aiqbee/aiqbee-mcp-brains" alt="License" /></a>
</p>

<p align="center">
  <strong>Connect your AI coding assistant to a shared knowledge brain — instantly.</strong><br/>
  One-click MCP connections for Claude Code, Cursor, Windsurf, and any MCP-compatible tool.<br/><br/>
  <em>Public Beta — we'd love your feedback! <a href="https://github.com/aiqbee/aiqbee-mcp-brains/issues">Report issues</a></em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=aiqbee.aiqbee-mcp-brains">Install from Marketplace</a> · <a href="https://www.aiqbee.com">Website</a> · <a href="https://app.aiqbee.com">Web App</a> · <a href="https://github.com/aiqbee/aiqbee-mcp-brains/issues">Issues</a>
</p>

---

## Why Aiqbee Brains?

### Save tokens, save money

A `CLAUDE.md` or `.cursorrules` file is loaded into every conversation — every token, every time. A brain with 500+ neurons would blow up your context window and cost.

With Aiqbee, your instructions file just tells the agent *when* to search the brain. The agent fetches only the 2-3 neurons it needs for the current task. The rest stays out of context.

**Real example:** Our own Product Development Brain holds 200+ neurons covering architecture decisions, coding patterns, lesson learned recipes, UI standards, and cross-repo conventions. An agent working on a frontend task searches for "UI pattern" and gets 3 relevant neurons (~800 tokens) instead of loading the entire knowledge base (~50,000+ tokens). That's a **98% reduction** in context usage per conversation.

### Live database, not a file in a repo

Brains are **shared, real-time databases**. When someone writes a neuron, it's immediately available to every user and agent with access. No commit, no push, no PR review cycle — just instant knowledge sharing.

This matters because:

- **Sub-agents** running in parallel can write findings to the brain and read each other's results in real time
- **Autonomous agents** can continuously update patterns and lessons learned as they work, without interrupting the developer
- **Cross-project knowledge** (API contracts, deployment patterns, security standards) is always current — not stale documentation waiting for someone to update a wiki

### Teams, not just tools

Brains aren't just for code. Product managers, marketing, QA, and developers all contribute to and consume from the same knowledge graph:

> **Example workflow:**
> 1. A marketing manager searches the brain for existing functionality, then adds a product requirement neuron describing a new feature needed
> 2. A developer's AI assistant finds the requirement during its pre-task brain search, implements the feature, and creates neurons documenting the new API endpoints, patterns used, and any lessons learned
> 3. The marketing manager immediately sees the updated product documentation — no waiting for code review, merge, or deployment
> 4. Meanwhile, autonomous agents running overnight capture additional patterns and link related neurons together, continuously enriching the brain

This collapses the feedback loop from days (write spec → implement → document → review → publish) to minutes.

---

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

---

## Installation

### From VS Code Marketplace

**[Install Aiqbee MCP Brains](https://marketplace.visualstudio.com/items?itemName=aiqbee.aiqbee-mcp-brains)** — or search for **"Aiqbee MCP Brains"** in the Extensions view (`Ctrl+Shift+X`).

### From Source

```bash
git clone https://github.com/aiqbee/aiqbee-mcp-brains.git
cd aiqbee-mcp-brains
npm install
cd webview-ui && npm install && cd ..
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

---

## Usage

1. Click the **Aiqbee** icon in the Activity Bar (left sidebar).
2. **Sign in** with your Aiqbee account.
3. Your brains appear in a compact list.
4. Click the **graph icon** to visualise a brain's knowledge structure.
5. Click the **+** button to add an MCP connection to your project.
6. Use the **Help** and **Prompts** tabs for guidance and ready-to-use prompts.

> **Tip:** After adding an MCP connection for the first time, restart VS Code or reload your AI assistant's window for it to pick up the new server.

---

## Commands

| Command                       | Description                     |
| ----------------------------- | ------------------------------- |
| `Aiqbee: Open Brain Manager`  | Focus the sidebar panel         |
| `Aiqbee: Sign In`             | Sign in to Aiqbee               |
| `Aiqbee: Sign Out`            | Sign out                        |
| `Aiqbee: Refresh Brains`      | Refresh the brain list          |
| `Aiqbee: Add MCP Connection`  | Add an MCP connection for a brain |

## Configuration

| Setting              | Default       | Description                                      |
| -------------------- | ------------- | ------------------------------------------------ |
| `aiqbee.environment` | `development` | API environment (`development` or `production`)  |

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

External contributors must sign our [Contributor License Agreement](CLA.md) — the CLA bot will prompt you on your first PR.

## License

[MIT](LICENSE) — Copyright (c) 2026 Aiqbee Limited
