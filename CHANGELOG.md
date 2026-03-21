# Changelog

All notable changes to **Aiqbee MCP Brains** will be documented in this file.

## [0.1.0-beta.1] - 2026-03-21

Initial public beta release.

### Added

- **Sign in** with Microsoft Entra, Google, or email/password
- **Account creation** with inline registration form
- **Brain list** in sidebar — compact one-per-row layout with neuron/type/synapse counts
- **One-click MCP connection** — writes config to `.claude/settings.json` or `.mcp.json`
- **Brain graph view** — force-directed visualisation in main editor panel with:
  - Brain statistics header (neurons, types, synapses)
  - Collapsible neuron type legend with colour coding
  - Node click popup showing neuron name, type, and content
  - Editable neurons for Owner/ReadWrite users (Save/Cancel with error retry)
  - Read-only view for Read access users
- **Help tab** — FAQ-style collapsible sections covering MCP setup, brain usage, service accounts, and available tools
- **Prompts tab** — 13 developer prompts with copy buttons for common brain operations
- **Create brain** dialog with template selection
- **Aiqbee logo** in sidebar header, clickable to open aiqbee.com
- **Responsive layout** — max-width 360px for sidebar content
- Two environment configs: development (default) and production
