# Changelog

All notable changes to **Aiqbee MCP Brains** will be documented in this file.

## [Unreleased]

### Fixed

- An older Hive Server that refuses to renew sign-ins (it answers the renewal with 403) no longer signs you out after about 15 minutes. The server shows an error explaining it may need updating, and reconnects without a new sign-in once it is.
- Sign-ins are renewed only when the access token is close to expiring, instead of every 15 minutes.
- Creating a brain on a Hive Server that refuses it now says why: the server's own reason, or that the Hive Server may need updating to support creating brains from VS Code.
- `Aiqbee: Create Brain…` offers every signed-in server, including one that is offline or failing, instead of hiding it (and, with one server left, silently creating the brain on another). With no server signed in it offers to sign in.

## [0.3.0] - 2026-11-21

### Added

- **Multiple servers** — sign in to Aiqbee Cloud and any number of Hive Servers at the same time. Each server keeps its own sign-in, and signing out of or losing one server never affects the others.
- **Brains view** — a native tree of servers with their brains underneath, with status for each server (signed out, session expired, offline, no supported sign-in method). Offline servers keep showing their last known brains.
- Server actions: add, rename, remove, sign in, sign out and refresh, from the tree, its right-click menus or the Command Palette.
- Brain actions in the tree: open the graph, add an MCP connection, create a brain from a template.
- `aiqbee.servers` user setting to add Hive Servers automatically. It is read from user settings only, never from a workspace.
- `Aiqbee: Create a Free Account` command.

### Changed

- The sidebar webview is now **Account & Help** with Account, Help and Prompts tabs. The Account tab shows a card per server with its sign-in options. Brains are listed in the Brains view instead of a Brains tab.
- The sidebar now fills its full width when widened (it was capped at 360px). Sign-in forms stay at a comfortable width.
- Brain graph panels belong to a server: the same brain name on two servers opens two panels, titles name the server when more than one is configured, and a panel becomes read-only if its server signs out.
- A server outage no longer signs you out; the server shows as offline and reconnects on the next refresh.
- MCP connections use the MCP address of the brain's own server.

### Fixed

- `Aiqbee: Add MCP Connection` now works from the Command Palette.
- `Aiqbee: Sign In` offers every sign-in method the server supports, not only Microsoft.
- `Aiqbee: Refresh` reloads servers and brains instead of only focusing the view.

### Upgrading

Your existing sign-in is moved to the new layout automatically the first time the extension starts. If you were connected to a Hive Server, it appears in the Brains view, still signed in.

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
