# Spec and Plan: Multi-Server, Sidebar Layout and Developer Features

**Date:** 2026-11-20
**Branch:** `feature/multi-server-enhancements` (from `develop`)
**Status:** Spec approved for planning; no production code written yet
**Author:** Claude AI for Sean Davidson

---

## 1. Summary

This spec covers three groups of work for the Aiqbee MCP Brains extension.

- **A. Multiple servers.** The user can add several Hive Servers alongside Aiqbee Cloud, stay signed in to all of them at once, and see a native outline with servers at the top level and their brains underneath.
- **B. Sidebar layout fix.** The tab bar and content stop at 360px because of one CSS rule on `#root`. Removing it lets the view fill the sidebar.
- **C. Developer features.** Twelve features (F1 to F12) for daily work with Claude Code and OpenAI Codex, and for adoption: one-click MCP setup, "Open in VS Code" links, team onboarding files, an instructions-file checkpoint, insert from brain, send selection to brain, a WYSIWYG neuron editor, and five smaller follow-ons.

**Constraint.** Everything is built in this extension against endpoints and web flows that exist today. The one exception is a single change request to Hive Server for `POST /api/neurons` (section 9). No change is requested of the SaaS backend or frontend.

**Delivery.** Four phases (section 7). Phase 1 is the sidebar fix and multi-server. Phase 2 is setup and install drivers. Phase 3 is editor and brain features. Phase 4 is the rest.

---

## 2. Decisions

These were made by the user on 2026-11-20 and are final for this spec.

| # | Decision |
|---|---|
| D1 | The server and brain outline is a **native VS Code TreeView**. The webview stays for sign-in, Help and Prompts. |
| D2 | All configured servers are signed in **at the same time**; the tree shows every server with its brains. |
| D3 | Neuron creation uses REST on cloud. For Hive, **one** change request adds `POST /api/neurons`. Until it lands, Hive offers update/append plus a copied agent prompt naming `aiqbee_create_neuron`. |
| D4 | Apart from D3, **only this extension changes**. No SaaS changes, no other change requests. |
| D5 | Links use the `https://vscode.dev/redirect` wrapper by default, with the raw `vscode://` URI as a secondary option. A manual verification task runs early, with a fallback. |
| D6 | The neuron editor is a **custom WYSIWYG webview editor**, not a virtual file system. |
| D7 | Hive Servers with only local accounts are an accepted limitation. The server node shows "No supported sign-in method". |
| D8 | Codex: run `codex mcp add <name> --url <url>` when the CLI is on PATH; otherwise append a `[mcp_servers.<name>]` table as text without rewriting the file. Default to `~/.codex/config.toml`; project `.codex/config.toml` is an option. Then offer `codex mcp login`. |
| D9 | Claude Code: default to project `.mcp.json`; offer `claude mcp add` at user scope when the CLI is found. Entry names are `aiqbee_<server>_<brain_slug>`. Offer to migrate old `Aiqbee Brain: <name>` entries. Never destroy a config that fails to parse. Register `aiqbee.addMcpConnection`. |
| D10 | The server list lives in globalState; secrets are keyed by server id in SecretStorage; an optional read-only `aiqbee.servers` setting pre-seeds servers. The setting is **user-level only** (`"scope": "application"`), so a repo cannot suggest servers; teammates add a Hive through an Open-in-VS-Code link instead. |
| D11 | There is **no promotional footer** on neurons and no setting for one. Links are generated on demand and never stored: "Copy link" on server, brain and neuron nodes, and an "Open in VS Code / Copy link" action in the neuron editor. Separately, "send selection" can include a **source reference** (`Source: <repo>/<path>:<line>`), which is a link through the extension's URI handler when the repo has a remote. It is off by default and remembered per workspace. |
| D12 | Remove the 360px cap from `#root`; cap only the login form at about 420px. |
| D13 | The checkpoint block is written to whichever of `CLAUDE.md` and `AGENTS.md` exist, with an offer to create the missing one. It stays short. |
| D14 | Features serve daily Claude Code use and new-user adoption equally. Claude Code comes first; features are agent-agnostic where cheap, and prefer standard MCP over anything Claude-specific. |
| D15 | Phasing is as in section 7. |
| D16 | The webview's Brains tab is removed; brains appear only in the native tree (see the consequences below). |
| D17 | The editor library is whatever the task 3.6 spike selects (Milkdown, or Tiptap if Milkdown misses the budget or the fidelity corpus), with no further decision round. |

Consequences of D1 that the user should be aware of:

- The webview's **Brains tab is removed**. Brain listing, create brain, the first-brain prompt and limit errors move to the native tree, QuickPicks and notifications.
- The webview's tabs become **Account, Help, Prompts**. Account lists servers with their sign-in state and hosts the sign-in form.

---

## 3. Research findings

### 3.1 This extension today

| Area | Finding | Location |
|---|---|---|
| Connection | One `Connection` in globalState under `aiqbee-connection`. Nothing stored means cloud. `connectToHive()` overwrites; `connectToCloud()` clears. | `src/connection/connection.ts` |
| Switching | Connecting to or leaving a Hive calls `authService.signOut()`. | `src/views/sidebar-provider.ts:136-165` |
| Tokens | Four fixed SecretStorage keys with no server id. | `src/auth/token-storage.ts:3-8` |
| API client | One instance; `baseUrl` comes from the single connection; one refresh handler. | `src/api/api-client.ts:27` |
| Auth | One instance with one `pendingCancel`. Cloud Microsoft is direct Entra PKCE on a loopback port then `POST /api/accounts/signin`. Cloud Google and Hive Entra/Google are brokered through `/api/vscode/auth/login`. Cloud email is `POST /api/auth/email/login`. Refresh has three paths. | `src/auth/auth-service.ts:181, 221-447` |
| Refresh timer | Refreshes the single session every 15 minutes. | `src/extension.ts:66-82` |
| Brains list | A React webview, not a TreeView. One contributed view of type `webview`. | `package.json`, `webview-ui/src/App.tsx:184-226`, `webview-ui/src/pages/BrainsPage.tsx` |
| Graph panel | `panels` keyed by `brainId` only; holds one `neuronService`. | `src/views/brain-graph-panel.ts:8` |
| MCP config | Writes `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.roo/mcp.json`. Entry name is `Aiqbee Brain: ${brainName}` (line 79). Malformed JSON is replaced with a fresh object (lines 103-106). No CLI path. | `src/mcp/mcp-config.ts` |
| Webview asset lookup | Picks the first `.js` and `.css` in `dist/webview/assets`. Breaks as soon as there is a second entry. | `src/views/sidebar-provider.ts:274-278, 306-315` |
| Gaps | `aiqbee.addMcpConnection` is declared but never registered. `aiqbee.signIn` only does Microsoft. `aiqbee.refresh` only focuses the view. No `registerUriHandler`. `activationEvents` is empty. | `package.json`, `src/extension.ts` |
| REST in use | `GET /api/brains/with-access`, `POST /api/brains`, `GET /api/brain-templates`, `GET /api/neurons`, `GET /api/neuron-types`, `GET /api/synapses`, `PUT /api/neurons/{id}`. | `src/api/*.ts` |
| Version | `package.json` on this branch says `0.2.2`; the brain records the published version as `v0.2.7`. Check before release. | `package.json` |

### 3.2 Sidebar width root cause

`webview-ui/src/styles/index.css:18-25`:

```css
#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  max-width: 360px;   /* line 22 */
  margin: 0 auto;     /* line 23 */
  width: 100%;
}
```

The whole app renders inside `#root`, so it is capped at 360px and centred. `.app-shell` (493), `.tab-bar` (499), `.tab-btn` (505, `flex: 1`) and `.tab-content` (529, `flex: 1`) are already fluid.

### 3.3 Hive Server (`D:\Development\aiqbee\hive-server`)

The local checkout's `origin/develop` ends at 16 Oct 2026 (PR #205). Later Hive changes are not reflected here.

| Capability | Detail | Location |
|---|---|---|
| Discovery | `GET /api/vscode/discovery`, no auth. Returns `backendType`, `version`, `authProviders`, `mcpBaseUrl`. | `devplatform/api/router.py:86` |
| Auth | Brokered `GET /api/vscode/auth/login` (providers `entra`, `google` only) and `POST /api/vscode/auth/refresh`. HS256 tokens, audience `hive-vscode-ext`. | `devplatform/api/auth.py`, `devplatform/api/jwt_utils.py:17` |
| Local accounts | Added 15 Oct with email-PIN MFA, but not offered to the extension. | `devplatform/web/auth/` |
| Extension REST | `GET /api/brains/with-access`, `POST /api/brains`, `GET /api/brain-templates`, `GET /api/neurons` (paged, max 255, full content), `PUT /api/neurons/{id}` (name, content, neuronTypeId all required), `GET /api/neuron-types`, `GET /api/synapses`. No create, delete, get-by-id or search. | `devplatform/api/router.py` |
| Token isolation | `/ui-api/*` is cookie-session only. MCP validates Entra, Google or `hive-mcp`-audience tokens, not the extension token. | `devplatform/mcp/token_validation.py`, `client_credentials.py:4-5` |
| MCP | `{mcpBaseUrl}/brain/{id}/mcp`, OAuth 2.1 PKCE. Loopback redirects allowed on any port; `vscode://` and similar schemes allowed. Seven prompts including `capture_lesson_learned`. | `devplatform/mcp/redirect_policy.py:21-22,51`, `devplatform/mcp/prompts.py` |
| Connect wizard | Generates `claude mcp add --transport http aiqbee-<slug> <url>` and VS Code/Cursor snippets. No Codex option. | `devplatform/services/connect_wizard.py` |
| Neuron editor | WYSIWYG with a Markdown source toggle; opens in source mode when the visual editor would rewrite the content. Content is stored as Markdown. | `devplatform/web/templates/components/_neuron_dialog.html:41-49` |
| Extension promotion | Only on the first-run setup page. | `devplatform/web/templates/admin/setup.html:40` |

### 3.4 SaaS backend (`D:\Development\aiqbee\platform-backend-newux`)

| Capability | Detail | Location |
|---|---|---|
| Auth | Brokered login, callback, refresh (Google only). Microsoft via `POST /api/accounts/signin`. Email via `POST /api/auth/email/login`, `POST /api/auth/refresh`. No discovery endpoint, no device-code flow. | `Aiqbee.Api/Controllers/VscodeAuthController.cs`, `AuthController.cs`, `AccountsController.cs` |
| Neurons | `GET /api/neurons`, `GET /api/neurons/search` (`brainId`, `searchTerm`, `includeRelated`, `neuronTypeId`, paging), `GET /api/neurons/{id}`, `POST /api/neurons` (`BrainId`, `NeuronTypeId`, `Name`, `Content`, `ContentDate`), `PUT /api/neurons/{id}`, `DELETE /api/neurons/{id}`. | `Aiqbee.Api/Controllers/NeuronsController.cs:43-237` |
| MCP server | Same prompts as Hive; loopback and `vscode://` redirects allowed. | `Aiqbee.McpServer2/aiqbee_mcp/auth/redirect_policy.py:49-50` |

### 3.5 SaaS frontend (`D:\Development\aiqbee\Platform-frontend-newux`)

| Capability | Detail | Location |
|---|---|---|
| MCP dialog | Per-client instructions. Claude Code: `claude mcp add-json "aiqbee-<slug>" '{"url":"…"}'`. No Codex option. | `src/layout/McpConnectorDialog.tsx:132` |
| Extension mentions | None anywhere in `src`. | — |
| Neuron rendering | `react-markdown` + `remark-gfm`. Only `https?:` and `mailto:` links are treated as external. | `src/components/NeuronContent.tsx:24` |
| Neuron URL | `https://app.aiqbee.com/brain/{brainId}/neuron/{neuronId}` (as returned by the MCP search tool). | — |

### 3.6 OpenAI Codex (confirmed from the official docs and the local `~/.codex/config.toml` key names)

- MCP servers live in `~/.codex/config.toml`, or project `.codex/config.toml` for trusted projects. The desktop app, CLI and IDE extension share it.
- Table `[mcp_servers.<name>]`; an HTTP server needs only `url`. Optional keys include `enabled`, `bearer_token_env_var`, `http_headers`.
- CLI: `codex mcp add <name> --url <url>`; sign-in with `codex mcp login <name>`.
- Instructions: `AGENTS.md` from the Git root down to the working directory, combined cap 32 KiB by default. `CLAUDE.md` is not read unless the user adds it to `project_doc_fallback_filenames`.
- Sources: `https://learn.chatgpt.com/docs/extend/mcp`, `https://learn.chatgpt.com/docs/agent-configuration/agents-md`.

### 3.7 Neuron metadata (checked as a future option only)

The question was whether a source reference could be stored outside neuron content, in a metadata or custom field the extension's REST token can read and write.

| System | Finding | Location |
|---|---|---|
| SaaS | No per-neuron custom metadata. The `Neuron` entity has none; `NeuronCreateDto` carries only brain, type, name, content and content date. The MCP server's "metadata" tools are schema and relationship lookups. The frontend has no metadata field UI. | `Aiqbee.Domain/Entities/Neuron.cs`, `Aiqbee.Application/Dto/NeuronCreateDto.cs`, `Aiqbee.McpServer2/aiqbee_mcp/tools/metadata.py` |
| Hive | Brain-level metadata fields with fixed allowed values exist (a paid entitlement). They are readable and writable through MCP (`aiqbee_list_metadata_fields`, a `metadata` argument on create and update) and shown in the web UI. They are **not** on the extension REST router: its neuron DTOs have no metadata. | `devplatform/models/brain_metadata_field.py`, `devplatform/mcp/tools_read.py:389`, `devplatform/mcp/tools_write.py:84`, `devplatform/web/templates/user/neuron_detail.html`, `devplatform/api/schemas.py:95-109` |

**Conclusion: not viable today.** SaaS has no mechanism, and Hive's is unreachable with the extension token, limited to fixed allowed values (so it cannot hold a free-form path), and paid. The source reference therefore lives in the neuron content. If both systems later expose free-text neuron metadata on the extension surface, the reference could move there. Nothing in this spec builds on it.

### 3.8 Knowledge base

The Aiqbee Product Development Brain was reachable. Practices applied here: Agentic Planning Protocol (plan in `tasks/todo.md`, check in before implementing), Cross-Repository Change Requests, VS Code Extension Testing standard (vitest, colocated tests), and the open bug on the unregistered `addMcpConnection` command.

---

## 4. Feature A: Multiple servers

### 4.1 Goals

- Add, rename, remove and sign in to any number of Hive Servers plus Aiqbee Cloud.
- Every server stays signed in independently. One server failing does not affect the others.
- Every brain, graph panel, editor tab and MCP entry is tied to a specific server.
- Existing users keep their session after upgrade.

Non-goals: more than one account per server; more than one cloud environment per build; neurons as tree nodes.

### 4.2 Data model

```ts
type ServerKind = 'cloud' | 'hive';

interface ServerEntry {
  id: string;              // 'cloud' for the built-in entry; crypto.randomUUID() for Hive
  kind: ServerKind;
  label: string;           // user-editable; defaults to 'Aiqbee Cloud' or the hostname
  baseUrl: string;         // normalised, no trailing slash
  mcpBaseUrl: string;
  authProviders: string[]; // filtered to those the extension supports
  version?: string;        // from Hive discovery
  origin: 'builtin' | 'user' | 'setting';
  addedAt: string;         // ISO date
}

interface ServerRef { serverId: string }
interface BrainRef extends ServerRef { brainId: string }
interface NeuronRef extends BrainRef { neuronId: string }
```

Runtime status, never persisted:

```ts
type ServerStatus =
  | 'signedOut'        // no session stored
  | 'signingIn'
  | 'connected'
  | 'authExpired'      // refresh was rejected; tokens cleared
  | 'offline'          // network failure or timeout; tokens kept
  | 'unsupportedAuth'  // Hive advertises no provider the extension supports (D7)
  | 'error';           // anything else, with a message
```

### 4.3 Persistence

| What | Where | Key |
|---|---|---|
| Server list | `globalState` | `aiqbee.servers.v1` (array of `ServerEntry`) |
| Session per server | `SecretStorage` | `aiqbee.server.<id>.session` holding one JSON object `{ accessToken, refreshToken, authType, user }` |
| Last used brain, type, MCP target | `workspaceState` | `aiqbee.recent.*` |
| Migration marker | `globalState` | `aiqbee.migration.v1` |

One JSON blob per server keeps a session atomic: it is written or deleted in a single call.

**`aiqbee.servers` setting** (array of `{ url, label? }`):

- Read at activation and on change. Each URL is normalised and merged into the list with `origin: 'setting'`.
- These entries cannot be removed or have their URL edited from the UI; they can be signed out. The UI says "Managed by settings".
- The setting is contributed with `"scope": "application"`, so VS Code only reads it from user settings. Workspace and folder values are ignored, which means a repo can never point the extension's sign-in at a hostile server. Teams share a Hive server through an Open-in-VS-Code link (F2), which has its own confirmation.

### 4.4 Components

`ConnectionManager` becomes the registry. Per-server services are grouped in a session object.

| Component | Responsibility |
|---|---|
| `ConnectionManager` (`src/connection/connection.ts`) | Owns the `ServerEntry` list. `list()`, `get(id)`, `addHive(url)`, `rename(id, label)`, `remove(id)`, `refreshDiscovery(id)`, `onDidChangeServers`. Rejects duplicates by normalised `baseUrl`. Keeps the existing URL normalisation and HTTPS-unless-localhost rule. |
| `TokenStorage` (`src/auth/token-storage.ts`) | Constructed with a server id; reads and writes that server's session blob. |
| `ApiClient` (`src/api/api-client.ts`) | Constructed with a fixed `baseUrl` and a scoped `TokenStorage`. Distinguishes network failure from HTTP failure with a new `NetworkError`. |
| `AuthService` (`src/auth/auth-service.ts`) | One per server, taking the `ServerEntry`. Sign-in flows unchanged in substance. `refreshToken()` returns `'ok' \| 'rejected' \| 'unreachable'` instead of a boolean so that an outage does not look like an expired session. |
| `ServerSession` (new, `src/connection/server-session.ts`) | Bundles `entry`, `tokenStorage`, `apiClient`, `authService`, `brainService`, `neuronService`, `status`, cached brains. Fires `onDidChangeStatus`. |
| `SessionManager` (new, `src/connection/session-manager.ts`) | Creates and disposes sessions as the registry changes. `get(serverId)`, `all()`, `require(ref)`. Runs one 15-minute timer that refreshes each signed-in session independently and catches per-session failures. |
| `ServersTreeProvider` (new, `src/views/servers-tree.ts`) | The native tree. |
| `SidebarProvider` | Reduced to Account, Help and Prompts. Every message carries `serverId`. |

Concurrency: each `AuthService` owns its own loopback server, port, PKCE verifier, CSRF state and cancel handle, so sign-ins on two servers can overlap. Refresh de-duplication stays per `ApiClient`.

Status transitions:

| Event | New status |
|---|---|
| Session blob present at activation | `connected` (optimistic), then confirmed by the first brains fetch |
| Sign-in succeeds | `connected` |
| API call returns 401 and refresh returns `rejected` | `authExpired`; session blob deleted; other servers untouched |
| Fetch throws or times out, or refresh returns `unreachable` | `offline`; tokens kept; retried on the next timer tick or manual refresh |
| Hive discovery returns no supported provider | `unsupportedAuth` |
| Sign out | `signedOut` |

Health checks use what exists: Hive `GET /api/vscode/discovery` (no auth); cloud has no unauthenticated health route, so its state comes from the result of real calls.

### 4.5 Tree view

- New view `aiqbee.serversView` ("Brains", type tree) in the `aiqbee-sidebar` container, above the existing webview view (renamed "Account & Help").
- `viewsWelcome` content when no server is signed in: "Sign in to Aiqbee Cloud", "Add a Hive Server", "Create a free account".

Nodes:

| Node | Label | Description | Icon | `contextValue` |
|---|---|---|---|---|
| Server, connected | label | user email | `cloud` or `server` | `server.connected` |
| Server, signed out | label | "Sign in" | same, dimmed | `server.signedOut` |
| Server, auth expired | label | "Session expired" | `warning` | `server.authExpired` |
| Server, offline | label | "Offline" | `debug-disconnect` | `server.offline` |
| Server, unsupported auth | label | "No supported sign-in method" | `error` | `server.unsupportedAuth` |
| Brain | name | Owner / Read-write / Read | `symbol-namespace` | `brain.writable` or `brain.readonly` |
| Placeholder | "No brains yet" / "Loading…" / error text | — | — | `placeholder` |

- A signed-out or expired server expands to a single "Sign in…" child that runs the sign-in command.
- An offline server keeps showing its last cached brains, greyed, so MCP setup and link copying still work.
- Brain tooltip shows description and neuron, type and synapse counts (fetched lazily on hover via `resolveTreeItem`).
- The cloud entry is always present and cannot be removed; it can be signed out.

Commands and menus:

| Command | Where | Behaviour |
|---|---|---|
| `aiqbee.addServer` | view title, palette, welcome | Input box for URL → normalise → discovery → add → offer sign-in |
| `aiqbee.renameServer` | server context | Input box |
| `aiqbee.removeServer` | server context (user-origin Hive only) | Modal confirm; deletes the session blob, closes that server's panels |
| `aiqbee.signIn` | server context, inline, palette | Server QuickPick if no argument; then section 4.6 |
| `aiqbee.signOut` | server context, palette | That server only |
| `aiqbee.refresh` | view title, server context, palette | Re-runs discovery and reloads brains for one or all servers |
| `aiqbee.createBrain` | server context, palette | Name input → template QuickPick (`GET /api/brain-templates`) → `POST /api/brains` |
| `aiqbee.openBrainGraph` | brain click, context | Opens the graph panel for that `BrainRef` |
| `aiqbee.openInWebApp` | cloud server and brain context | Opens the web app |

Limit errors from `POST /api/brains` (the structured body already parsed in `sidebar-provider.ts:255-271`) become an error notification with a "Manage plan" action on cloud.

### 4.6 Sign-in

- **Hive, one provider:** start brokered sign-in immediately.
- **Hive, several providers:** QuickPick of providers.
- **Cloud:** QuickPick of Microsoft, Google, Email. Email focuses the webview's Account tab on that server's email form (a password field belongs in the form, not a QuickPick).
- `SignUpRequired`, `PendingApproval` and `Disabled` states keep their current handling, shown as a notification and on the Account tab, with the sign-up link on cloud only.
- A sign-in in progress shows `signingIn` on the node with a "Cancel" inline action.

### 4.7 Identifying the owning server

- Every command argument and webview message carries a `ServerRef`, `BrainRef` or `NeuronRef`. `WebviewMessage` and `ExtensionMessage` in `src/api/types.ts` gain `serverId` on every variant that touches data.
- `BrainGraphPanel.panels` is keyed by `${serverId}:${brainId}`. The panel takes a `ServerSession`, not a shared `neuronService`.
- Panel titles append the server label only when more than one server is configured: `Brain name — hive.example.com`.
- If a server is removed or signs out, its panels show a banner and disable writes; they are closed on removal.

### 4.8 Migration

Runs once at activation when `aiqbee.migration.v1` is absent. It is idempotent and never deletes legacy data before the new data is written.

1. Create the built-in cloud entry.
2. Read legacy `aiqbee-connection`. If it is a Hive connection, create a Hive entry from it.
3. Read the four legacy secrets. If an access token exists, write a session blob for the server that was active (the Hive entry if step 2 created one, otherwise cloud).
4. Write `aiqbee.servers.v1`, then the marker.
5. Delete the four legacy secrets and `aiqbee-connection`.

If any step throws, nothing legacy is deleted and migration is retried at the next activation. A user who was on Hive ends up with cloud signed out and the Hive signed in, which matches what they had.

### 4.9 MCP implications

- The MCP URL for a brain is built from its server's `mcpBaseUrl`.
- Entry names include the server (section 6.1) so the same brain name on two servers cannot collide.
- Detection of "which brain is this workspace connected to" matches config URLs against every known `mcpBaseUrl`.

### 4.10 Backend endpoints

None new. Multi-server uses discovery, brokered login, refresh and `brains/with-access`, all of which exist on every server.

### 4.11 Acceptance criteria

- Cloud and two Hive Servers can be signed in together; the tree shows all three with their brains.
- Signing out of, or losing, one server leaves the others working.
- Stopping a Hive Server shows "Offline" within one refresh; restarting it recovers without signing in again.
- A Hive with no supported provider can be added and shows "No supported sign-in method".
- An upgraded install keeps its session and shows it under the right server.
- Two graph panels for same-named brains on different servers stay separate.

---

## 5. Feature B: Sidebar layout fix

**Change** in `webview-ui/src/styles/index.css`:

- Delete `max-width: 360px` (line 22) and `margin: 0 auto` (line 23) from `#root`.
- Add `min-width: 0` to `.tab-content` so long content cannot force overflow.
- Add `max-width: 420px` to the login form container only, left-aligned (the wrapper class used by `LoginPage.tsx`).
- Leave `.dialog { max-width: 400px }` (line 251) as it is.

**Verify** in the Extension Development Host at about 170px, 300px, 600px and maximum width, and with the view moved to the secondary side bar and the bottom panel:

- The tabs split the full width evenly.
- Content fills the width with no side gutters.
- Long names ellipsise; there is no horizontal scrollbar.
- The login form stops growing at about 420px.

---

## 6. Feature C: Developer features

Ranked by combined value to daily agent use and adoption.

| ID | Feature | Phase | Drives installs | Effort | Agent scope |
|---|---|---|---|---|---|
| F1 | One-click MCP setup (Claude Code, Codex, others) | 2 | Indirect | M | Agent-agnostic; CLI paths are per agent |
| F2 | Open-in-VS-Code links and badges | 2 | **Yes** | M | Agent-agnostic |
| F3 | Team onboarding file | 2 | **Yes** | S | Agent-agnostic; MCP file is per agent |
| F4 | CLAUDE.md / AGENTS.md checkpoint | 2 | **Yes** (link in a committed file) | S | Both |
| F5 | Insert brain content at cursor | 3 | No | S–M | Agent-agnostic |
| F6 | Send selection to brain | 3 | No | M | Agent-agnostic |
| F7 | WYSIWYG neuron editor | 3 | No | L | Agent-agnostic |
| F8 | First-run walkthrough | 4 | Converts installs to signups | S | Both |
| F9 | Status bar brain indicator | 4 | No | S | Both |
| F10 | Cross-server search | 4 | No | M | Agent-agnostic |
| F11 | Capture lesson or decision | 4 | No | M | Agent-agnostic (REST or copied prompt) |
| F12 | Hover for brain and neuron links | 4 | No | M | Agent-agnostic |

Claude Code-only parts, and why: the `claude mcp add` CLI and its scopes; project-root `.mcp.json` as a committable file (Codex's project file only loads in trusted projects). Nothing in this spec uses Claude Code hooks or slash commands.

### 6.1 F1: One-click MCP setup

**Problem.** Connecting an agent to a brain means finding the URL and editing a config file by hand. The current command overwrites broken configs, uses names that collide across servers, has no CLI path and no Codex support, and is not reachable from the palette.

**Flow.**

1. Trigger from a brain node, the palette (`aiqbee.addMcpConnection`: server → brain), or the walkthrough.
2. Pick a target:

   | Target | Mechanism | Scope |
   |---|---|---|
   | Claude Code — this project (default) | Write `.mcp.json` | Project, committable |
   | Claude Code — all projects | `claude mcp add --transport http --scope user <name> <url>` (shown only when `claude` is on PATH) | User |
   | Codex — all projects | `codex mcp add <name> --url <url>` when `codex` is on PATH; otherwise append to `~/.codex/config.toml` | User |
   | Codex — this project | Append to `.codex/config.toml` | Project, trusted projects only |
   | Cursor / VS Code Copilot / Roo Code | Existing JSON writers | Project |

3. The extension writes or runs, then shows the next step: "Run `/mcp` in Claude Code to sign in", or an offer to run `codex mcp login <name>` in a terminal.

**Naming.** `aiqbee_<server>_<brain_slug>`: lowercase letters, digits and underscores. `<server>` is `cloud` or a slug of the hostname. `<brain_slug>` is the brain name slugged and cut to 40 characters. If the name already exists in the target for a different URL, append the first six characters of the brain id.

**Safe JSON writing.**

- Read the file. If it does not parse, **stop**: show an error with "Open file" and write nothing.
- If the parsed root is not an object, stop the same way.
- Merge the one entry, write to a temporary file in the same folder, then rename over the original.

**Codex text append (no CLI).**

- If the file contains `mcp_servers` as an inline table or dotted key, do not edit; copy the snippet to the clipboard and open the file.
- If `[mcp_servers.<name>]` already exists with the same URL, do nothing. With a different URL, do not edit; show the file and copy the snippet.
- Otherwise append, after ensuring a trailing newline:

  ```toml

  [mcp_servers.aiqbee_cloud_my_brain]
  url = "https://mcp.aiqbee.com/brain/<id>/mcp"
  ```

- Create the file and folder if missing. Never rewrite existing content.

**Running CLIs.** Use `child_process.execFile` with an argument array. The name is validated against `^[a-z0-9_]+$` and the URL is rebuilt from a parsed `URL`, so no user-controlled text reaches a shell. On Windows the CLIs are `.cmd` shims that need `shell: true`; the same validation makes that safe. The `claude mcp add` flags were confirmed in task 0.2. `--scope` is always passed, because the CLI defaults to `local`.

**Migration of old entries.** When the chosen JSON target contains keys starting with `Aiqbee Brain: ` whose URL matches a known server's MCP base, offer "Rename to the new format". Declining leaves them untouched.

**Endpoints.** None; only the MCP URL.

**Not possible extension-only.** Confirming that the agent actually connected. Hive's verify route is cookie-session only.

**Adoption.** This is the extension's main reason to exist; Codex support is something neither web app offers.

**Risks.** CLI flags change between versions (mitigation: fall back to file writing on a non-zero exit and show the command's output). User-global TOML is sensitive (mitigation: append-only rules above).

### 6.2 F2: Open-in-VS-Code links and badges

**Problem.** Nothing sends people from a brain, a repo or a chat message to the extension.

**Link format.**

- Brain or neuron, raw: `<scheme>://aiqbee.aiqbee-mcp-brains/open?v=1&server=<cloud|https-base-url>&brain=<id>&neuron=<id>&name=<brain name>` where `<scheme>` is `vscode.env.uriScheme`.
- Source file, raw: `<scheme>://aiqbee.aiqbee-mcp-brains/open-file?v=1&repo=<normalised remote>&path=<repo-relative path>&line=<n>&endLine=<n>` (used by F6, section 6.6).
- Default (wrapped): `https://vscode.dev/redirect?url=<encodeURIComponent(raw vscode:// URI)>`.
- Links never contain tokens, credentials or user identifiers.
- Links are **generated on demand and never stored** by the extension. The only link the extension writes into brain content is the optional source reference in F6.

**Handler** (`vscode.window.registerUriHandler`, activation event `onUri`):

1. Parse and validate: `v` is known, ids are GUIDs, `server` is `cloud` or an HTTPS URL (HTTP only for localhost).
2. Known server: reveal it in the tree.
3. Unknown server: modal confirm showing the full host ("Add Hive Server hive.example.com?"). On confirm, run discovery and add it. Nothing is contacted before the confirm.
4. Not signed in: start sign-in for that server, then continue.
5. Open the brain graph, or the neuron editor when `neuron` is present. If the user has no access, say so.

The `/open-file` path is handled as described in section 6.6.

**Generating links.**

- "Copy link" on server and brain nodes in the tree, and on neurons wherever they are listed (graph panel, F5 results): default wrapped; "Copy raw vscode:// link" as a second command.
- The neuron editor header has an "Open in VS Code / Copy link" action. It is part of the editor UI only and is never written into the neuron.
- "Copy README badge" on a brain: Markdown image link using a shields.io badge that points at the wrapped link.
- `aiqbee.openLink` command: paste any Aiqbee link to open it. This is also the fallback path.
- There is no footer on neurons and no setting for one (D11).

**Verification first (task 0.1).** Two behaviours are assumed and must be tested by hand before F2 is built:

| Assumption | If it fails |
|---|---|
| Opening the raw URI when the extension is not installed makes VS Code offer to install it and then replays the URI. | Links and badges point at the Marketplace page. The Help page and README explain "install, then click the link again" and `aiqbee.openLink`. |
| `https://vscode.dev/redirect?url=…` forwards to a third-party extension's `vscode://` URI. | Default to the raw URI where it is clickable; in READMEs use a Marketplace badge plus the raw link in a code span for `aiqbee.openLink`. |

**Endpoints.** Discovery, brokered login, `brains/with-access`.

**Adoption.** This is the main install driver. Every link shared in a README, PR, chat or neuron can install the extension and land the reader on the brain.

**Risks.** Dependence on a Microsoft redirect service; phishing through a crafted server URL (mitigation: the confirm step, HTTPS only, no automatic sign-in); forks such as Cursor use other schemes (the wrapped link opens VS Code; the raw link uses the current editor's scheme).

### 6.3 F3: Team onboarding file

**Problem.** One developer connects a brain; teammates never hear about it.

**Flow.** `aiqbee.setupTeamOnboarding` on a brain:

1. Add `aiqbee.aiqbee-mcp-brains` to `recommendations` in `.vscode/extensions.json`, so VS Code prompts each teammate to install.
2. Ensure the brain's entry is in `.mcp.json` (F1, project scope).
3. For a Hive brain, offer to add an Open-in-VS-Code link for the brain (F2) to the README and the F4 checkpoint block, so a teammate can add the server in one click. Servers are not pre-seeded through workspace settings (D10).
4. Offer F4.
5. Show the changed files so the user can review and commit. The extension never commits.

`.vscode/extensions.json` allows comments, so it is edited with `jsonc-parser` (`modify` + `applyEdits`), which preserves comments and formatting. A file that fails to parse is not touched.

**Endpoints.** None.

**Adoption.** Each repo that adopts this prompts every contributor to install.

**Risks.** Writing into shared files (mitigation: preview and explicit confirm for each file).

### 6.4 F4: CLAUDE.md / AGENTS.md checkpoint

**Problem.** A connected brain is only useful if the agent is told when to search it.

**Flow.** `aiqbee.addBrainCheckpoint` on a brain:

- Write the block to whichever of `CLAUDE.md` and `AGENTS.md` exist at the workspace root; offer to create the missing one.
- The block sits between `<!-- aiqbee:begin -->` and `<!-- aiqbee:end -->`. Re-running replaces the block in place and touches nothing else.
- Content, under about 600 bytes (Codex caps combined instructions at 32 KiB):

  ```markdown
  <!-- aiqbee:begin -->
  ## Knowledge base

  This project uses the **<Brain name>** Aiqbee brain through the MCP server `<entry name>`.
  Search it before starting work, before commits and PRs, and after fixing a non-obvious bug (record the lesson).

  [Open this brain in VS Code](<wrapped link>)
  <!-- aiqbee:end -->
  ```

**Endpoints.** None.

**Adoption.** The link is committed to the repo and read by every contributor.

**Risks.** Editing a hand-maintained file (mitigation: only the marked block is ever replaced; preview first).

### 6.5 F5: Insert brain content at cursor

**Problem.** Pulling a pattern or decision out of a brain means switching to the browser.

**Flow.** `aiqbee.insertFromBrain` (palette, editor context menu):

1. Scope defaults to the workspace's connected brain (from `.mcp.json`), else a brain QuickPick across servers; remembered per workspace.
2. Type to search, debounced.
3. Pick a neuron, then "Insert content" or "Insert link" (cloud web URL, or the wrapped Open-in-VS-Code link for Hive).

**Search.**

| Server | Method |
|---|---|
| Cloud | `GET /api/neurons/search?brainId=&searchTerm=&pageSize=20` |
| Hive | Page `GET /api/neurons` once, cache for 60 seconds, filter name and content client-side. If the optional search route from the change request exists, use it; a `404` or `405` selects the fallback for the session. |

**Risks.** Large Hive brains make the first search slow (mitigation: progress indicator, cache, the 255 page size).

### 6.6 F6: Send selection to brain

**Problem.** Capturing a snippet or note into a brain breaks flow.

**Flow.** `aiqbee.sendSelectionToBrain` (editor context menu when there is a selection, palette):

1. Pick a writable brain (remembered per workspace).
2. Choose "New neuron" or "Append to existing neuron".
3. New: title (default from the first line), neuron type (`GET /api/neuron-types?brainId=`, last choice remembered).
4. The content is the selection, fenced with the document's language for code files.
5. A final confirm step shows the destination server and brain, with a toggle **"Include source reference"**. Nothing is sent without the confirm.

**Source reference.** This tells a later reader where the text came from. It is content for the reader, not branding.

- Off by default. The choice is remembered per workspace (`workspaceState`).
- It applies to both "New neuron" and "Append".
- Without a Git remote, it is plain text on the last line: `Source: <repo folder>/<path>:<line>` (or `:<start>-<end>` for a range).
- With a remote, the same text is a link: `Source: [<repo>/<path>:<line>](<wrapped open-file link>)`.
- The remote is `origin` if present, otherwise the first remote. It is normalised to `host/owner/repo`: scheme, `.git`, and any user name, password or token in the URL are removed. SSH forms (`git@host:owner/repo`) normalise the same way.
- The confirm step shows the exact line that will be added, so the user sees that a repo name and path are about to be stored in a shared brain.
- Repository and remote data come from the built-in Git extension's API (`vscode.git`). If it is unavailable, the plain-text form is used with the workspace folder name.

**Opening a source link.** The URI handler's `/open-file` path:

1. Validates `repo` (normalised form only), `path` (relative, no `..` segments, no drive letters or leading slash) and the line numbers.
2. Looks for a repository in the open workspace folders whose normalised remote equals `repo`. If found, opens the file at the line and selects the range.
3. If the file does not exist in that checkout, says so and offers to reveal the repository root. It does not guess.
4. If no open folder matches, shows a prompt naming the repository with these choices:
   - **Open a local folder…** The user picks a folder; the handler checks its remote matches before opening the file.
   - **Clone repository…** Runs VS Code's own `git.clone` command with the HTTPS form of the remote, after the prompt has shown the full URL. The extension never clones silently.
   - **Copy remote URL.**
   - **Cancel.**
5. The link opens the working copy as it is now. The line may have moved since the neuron was written; the neuron's fenced text is the record of what was captured.

**Endpoints.**

| Action | Cloud | Hive |
|---|---|---|
| New neuron | `POST /api/neurons` | `POST /api/neurons` once the change request lands. On `404` or `405`: offer "Append to existing" or "Copy agent prompt". |
| Append | Fetch current, then `PUT /api/neurons/{id}` | Same; Hive needs `name`, `content` and `neuronTypeId` in the body |

The copied agent prompt is plain text that names the MCP server entry, the tool `aiqbee_create_neuron`, the title, type and content. It works in Claude Code and Codex.

**Risks.** Sending private code to a shared brain by mistake (mitigation: the confirm step names the destination; read-only brains are not offered). A source reference discloses a repository name and path to everyone with access to the brain (mitigation: off by default, exact text previewed, credentials stripped from the remote). A crafted `open-file` link could try to open an unexpected path or clone an unexpected repo (mitigation: path validation, remote must match an open or user-chosen folder, clone only after an explicit prompt showing the URL).

### 6.7 F7: WYSIWYG neuron editor

**Problem.** Neurons are edited in a small inline form in the graph panel or in the browser.

#### Library choice

Requirements: themed entirely with VS Code CSS variables; Markdown in and out with high fidelity; small bundle; works under the webview CSP; React 18.

| Option | Markdown round-trip | Theming | Size | Verdict |
|---|---|---|---|---|
| **Milkdown** (`@milkdown/kit`, `@milkdown/react`; ProseMirror + remark) | Markdown is the document model; remark parse and stringify give the best fidelity of the options | Headless: ships no styles, so all CSS is ours | Medium | **Chosen** |
| Tiptap + a Markdown extension | Converts through HTML or markdown-it; lossier on tables, nested lists, raw HTML | Headless | Medium | Fallback |
| Toast UI Editor | Good | Ships its own stylesheet; hard to map to VS Code variables | Large | Rejected |
| MDXEditor (Lexical) | Good, MDX-oriented | Ships its own UI and styles | Large | Rejected |
| Lexical + `@lexical/markdown` | Lossy for tables and HTML | Headless | Small to medium | Rejected |

Sizes above are relative judgements, not measurements. Task 3.6 is a spike that measures the real bundle and runs a fidelity corpus before the editor is built. Budget: the editor entry adds no more than 400 KB gzipped and the VSIX grows by no more than 1.5 MB. If Milkdown fails the budget or the corpus, switch to Tiptap.

The editor is a separate webview entry so the sidebar bundle does not grow.

#### Fidelity guard

Same rule Hive's web editor uses:

- On open, compute `serialise(parse(content))` and compare it with the original after normalising line endings and trailing whitespace.
- If they match, open in visual mode.
- If they differ, open in **source mode** (a themed `<textarea>`) with a banner: "This neuron uses Markdown the visual editor would rewrite." The user may switch to visual mode knowingly.
- Saving from source mode sends the text exactly as typed.
- Saving from visual mode when nothing was edited sends nothing.
- `[[wiki links]]`, fenced code (including `mermaid`), tables and raw HTML are in the test corpus.

#### Panel

- `NeuronEditorPanel` (`src/views/neuron-editor-panel.ts`), one per `${serverId}:${brainId}:${neuronId}`; re-opening reveals the existing tab.
- Tab title: `<neuron name> — <server label>` (server label only when more than one server is configured), prefixed with `●` when there are unsaved changes.
- A header inside the editor always shows **server › brain › neuron type**, with the server's icon, so the owning server is never in doubt.
- Fields: name, neuron type (select), content. Read-only when the brain is not writable.
- `Ctrl+S` / `Cmd+S` saves. "Open in VS Code / Copy link" and "Open in web app" (cloud) are in the header. They are editor actions and are never saved into the neuron.
- "New neuron" opens the same panel with empty fields; on Hive without the create endpoint the Save button is replaced by "Copy agent prompt".
- All API calls happen in the extension host; the webview only posts messages. State uses `useReducer`.
- Opened from: brain context menu ("New neuron"), graph panel node ("Open in editor"), F5 results, F2 links.

#### Save and conflict behaviour

Neither backend exposes a version or ETag on this surface, so conflicts are detected by comparison.

1. On open, keep a **base** snapshot of name, content and type.
2. On save, fetch the current neuron (cloud `GET /api/neurons/{id}`; Hive the optional get-by-id route, else a scan of the paged list).
3. If current equals base, `PUT /api/neurons/{id}` and set base to what was saved.
4. If current differs from base, show a conflict prompt:
   - **Compare** opens VS Code's diff editor (theirs against mine) using a read-only `TextDocumentContentProvider`.
   - **Overwrite** saves mine.
   - **Reload theirs** replaces the editor content and keeps mine as a draft.
   - **Cancel**.
5. A small window remains between the fetch and the `PUT`. This is accepted and documented.

A webview panel cannot block its own closing. If a tab with unsaved changes is closed, the draft is stored in `globalState` under the neuron's key and a notification offers "Restore draft" or "Discard". Opening the neuron again also offers the draft.

If the session expires or the server goes offline, saving is disabled with a banner and the draft is kept.

**Endpoints.** `GET /api/neurons`, `GET /api/neuron-types`, `PUT /api/neurons/{id}` on both; `GET /api/neurons/{id}` and `POST /api/neurons` on cloud; `POST /api/neurons` on Hive after the change request.

**Risks.** Markdown rewriting (mitigation: the fidelity guard and corpus); bundle size (mitigation: the spike and budget); CSP with a second entry and shared chunks (mitigation: named assets, `script-src` allowing the webview source alongside the nonce).

### 6.8 F8: First-run walkthrough

A `contributes.walkthroughs` entry: create an account (opens the existing web sign-up) or add a Hive Server → sign in → create the first brain → connect Claude Code or Codex (F1) → add the checkpoint (F4). Each step completes on the matching command. Replaces the webview's first-brain prompt. No endpoints beyond those already used.

### 6.9 F9: Status bar brain indicator

A status bar item showing the brain and server the workspace is connected to, found by matching URLs in `.mcp.json` and project `.codex/config.toml` against known servers. Click for: open graph, search (F5), set up MCP (F1). Hidden when nothing matches. File watchers keep it current.

### 6.10 F10: Cross-server search

`aiqbee.searchAllBrains`: one QuickPick that searches every signed-in server in parallel using the F5 search service, with results grouped under separators per server and brain. A slow or offline server times out on its own and is marked, without blocking the rest. On Hive it searches only brains whose neuron list is already cached or that the user has opened, to avoid downloading every brain.

### 6.11 F11: Capture lesson or decision

`aiqbee.captureLesson`: opens the neuron editor (F7) in new-neuron mode with a template (Problem / What didn't work / Correct approach), pre-filled from the selection and the current Git branch name. A second action copies a plain agent prompt asking the agent to run the standard `capture_lesson_learned` MCP prompt for the session. Uses the same endpoints and Hive fallback as F6.

### 6.12 F12: Hover for brain and neuron links

A `HoverProvider` for Markdown and plain text that recognises cloud neuron URLs, wrapped Aiqbee links and raw Aiqbee URIs for known servers. Shows the neuron title, type and the first lines, with "Open in editor". Fetches are cached and only happen for servers that are signed in.

---

## 7. Phased implementation plan

Before starting each phase, write the phase's steps to `tasks/todo.md` and check in, as the Agentic Planning Protocol requires. Each phase is its own PR to `develop`.

### Phase 0: Verification

| Task | Description |
|---|---|
| 0.1 | Manual test of the two link assumptions (section 6.2) on Windows and macOS, stable VS Code, extension uninstalled: raw URI install-then-replay, and the `vscode.dev/redirect` wrapper. Record the result in this spec and pick the main or fallback design for F2. |
| 0.2 | Run `claude mcp add --help` and `codex mcp add --help`; record the exact flags for F1. |
| 0.3 | Confirm the published version and set `package.json` accordingly before the first release from this branch. |

**Phase 0 results (2026-11-20)**

- **0.1 — pending, manual.** It splits in two, because the published extension has no URI handler yet, so a replay cannot be observed today:
  - **0.1a (now):** with the extension uninstalled, open `vscode://aiqbee.aiqbee-mcp-brains/open?v=1` and record whether VS Code offers to install it. Then open `https://vscode.dev/redirect?url=vscode%3A%2F%2Faiqbee.aiqbee-mcp-brains%2Fopen%3Fv%3D1` in a browser, and in a GitHub README preview, and record whether the browser hands off to VS Code.
  - **0.1b (after task 2.8 ships in a pre-release):** confirm that, after install, the URI is replayed to the new handler.
  - F2 is not started until 0.1a is recorded. Phase 1 does not depend on it.
- **0.2 — done for Claude Code.** `claude mcp add [options] <name> <commandOrUrl>` with `-t/--transport http` and `-s/--scope local|user|project`. **The default scope is `local`, so the extension must always pass `--scope` explicitly.** Other flags available: `--callback-port`, `--client-id`, `-H/--header`. The Codex CLI is not installed on the dev machine, so its syntax stays as documented (`codex mcp add <name> --url <url>`, `codex mcp login <name>`), with the non-zero-exit fallback to text append. Re-check when Codex is installed.
- **0.3 — done; no change needed.** Published version is `v0.2.7` (the latest tag; `master` `package.json`). `develop` shows 0.2.2 because releases are bumped on `master` only (`npm version patch` after the merge), and the version line has never been changed on `develop`, so merges keep `master`'s value. Leave `package.json` alone on this branch.

### Phase 1: Sidebar fix and multi-server

| Task | Description | Main files |
|---|---|---|
| 1.1 | Sidebar CSS fix (section 5) and manual width check. | `webview-ui/src/styles/index.css`, `webview-ui/src/pages/LoginPage.tsx` |
| 1.2 | `ServerEntry` model, registry API, duplicate and URL rules, `unsupportedAuth` instead of throwing. | `src/connection/connection.ts` |
| 1.3 | Server-scoped `TokenStorage` with one session blob. | `src/auth/token-storage.ts` |
| 1.4 | `ApiClient` with fixed base URL, `NetworkError`. | `src/api/api-client.ts` |
| 1.5 | `AuthService` per server; three-state refresh result. | `src/auth/auth-service.ts` |
| 1.6 | `ServerSession` and `SessionManager`; per-session refresh timer. | `src/connection/server-session.ts`, `src/connection/session-manager.ts` |
| 1.7 | Migration from the single connection. | `src/connection/migration.ts` |
| 1.8 | `aiqbee.servers` setting, user-level only (`"scope": "application"`). | `src/connection/settings-servers.ts`, `package.json` |
| 1.9 | `ServersTreeProvider`, nodes, welcome content. | `src/views/servers-tree.ts`, `package.json` |
| 1.10 | Commands: add, rename, remove, sign in, sign out, refresh, create brain, open graph. | `src/commands/server-commands.ts`, `src/commands/brain-commands.ts`, `src/extension.ts`, `package.json` |
| 1.11 | Webview becomes Account / Help / Prompts; all messages carry `serverId`; remove `BrainsPage`, `BrainCard`, `CreateBrainDialog`. | `src/views/sidebar-provider.ts`, `src/api/types.ts`, `webview-ui/src/App.tsx`, `webview-ui/src/pages/AccountPage.tsx`, `webview-ui/src/pages/LoginPage.tsx` |
| 1.12 | Graph panel keyed by server and brain; server label in title; removal and sign-out handling. | `src/views/brain-graph-panel.ts` |
| 1.13 | MCP URL from the brain's server (naming change comes in 2.1). | `src/mcp/mcp-config.ts` |
| 1.14 | README, CHANGELOG, Help page text. | `README.md`, `CHANGELOG.md`, `webview-ui/src/pages/HelpPage.tsx` |

### Phase 2: Setup and install drivers

| Task | Description | Main files |
|---|---|---|
| 2.1 | Entry naming and slug rules. | `src/mcp/naming.ts` |
| 2.2 | Safe JSON writer (no overwrite on parse failure, atomic write); refactor existing targets onto it. | `src/mcp/json-config.ts`, `src/mcp/mcp-config.ts` |
| 2.3 | CLI detection and runner with validated arguments. | `src/mcp/cli.ts` |
| 2.4 | Claude Code targets (project file, user CLI). | `src/mcp/targets/claude-code.ts` |
| 2.5 | Codex targets (CLI, append-only TOML, project file), `codex mcp login` offer. | `src/mcp/targets/codex.ts`, `src/mcp/toml-append.ts` |
| 2.6 | Register `aiqbee.addMcpConnection`; palette flow; old-entry migration offer. | `src/commands/mcp-commands.ts`, `src/extension.ts`, `package.json` |
| 2.7 | Link builder and parser. | `src/links/link.ts` |
| 2.8 | URI handler, unknown-server confirm, `aiqbee.openLink`, `onUri` activation. | `src/links/uri-handler.ts`, `src/extension.ts`, `package.json` |
| 2.9 | Copy link and copy raw link on server and brain nodes; copy README badge. No footer, no setting. | `src/commands/link-commands.ts`, `package.json` |
| 2.10 | JSONC editor helper (`jsonc-parser`). | `src/workspace/jsonc-edit.ts`, `package.json` |
| 2.11 | Team onboarding command. | `src/commands/onboarding-commands.ts` |
| 2.12 | Checkpoint block writer for `CLAUDE.md` and `AGENTS.md`. | `src/workspace/checkpoint-block.ts` |
| 2.13 | README, CHANGELOG, Help page; Prompts page wording made agent-neutral where it names only Claude. | `README.md`, `CHANGELOG.md`, `webview-ui/src/pages/HelpPage.tsx`, `webview-ui/src/pages/PromptsPage.tsx` |

### Phase 3: Editor and brain

| Task | Description | Main files |
|---|---|---|
| 3.1 | `NeuronService`: `createNeuron`, `getNeuron`, `searchNeurons` with per-server capability detection and Hive fallbacks. | `src/api/neuron-service.ts`, `src/api/types.ts` |
| 3.2 | Brain and neuron QuickPick helpers; recent choices. | `src/ui/pickers.ts` |
| 3.3 | Insert from brain (F5). | `src/commands/insert-commands.ts`, `package.json` |
| 3.4 | Selection formatter (fence) and agent prompt builder. | `src/editor/selection-format.ts`, `src/editor/agent-prompt.ts` |
| 3.4a | Git remote lookup and normalisation (credentials stripped); source reference builder; `open-file` link build and parse. | `src/workspace/git-remote.ts`, `src/editor/source-reference.ts`, `src/links/link.ts` |
| 3.4b | URI handler `/open-file`: path validation, workspace match, open-folder, clone and copy-URL choices. | `src/links/open-file.ts`, `src/links/uri-handler.ts` |
| 3.5 | Send selection to brain (F6), with the per-workspace "Include source reference" toggle. | `src/commands/send-commands.ts`, `package.json` |
| 3.6 | Editor spike: Milkdown bundle size and fidelity corpus; confirm or switch to Tiptap. | `webview-ui/` (throwaway branch) |
| 3.7 | Webview build with two named entries; fix asset lookup and CSP. | `webview-ui/vite.config.ts`, `webview-ui/editor.html`, `src/views/webview-html.ts`, `src/views/sidebar-provider.ts` |
| 3.8 | Editor webview: visual and source modes, fidelity guard, header, reducer. | `webview-ui/src/editor/*` |
| 3.9 | `NeuronEditorPanel`: load, save, conflict flow, diff provider, drafts. | `src/views/neuron-editor-panel.ts`, `src/views/neuron-conflict.ts`, `src/views/neuron-diff-provider.ts` |
| 3.10 | Entry points: tree, graph panel, F5 results, links. | `src/views/brain-graph-panel.ts`, `src/links/uri-handler.ts`, `package.json` |
| 3.11 | README, CHANGELOG, Help page. | as above |

### Phase 4: The rest

| Task | Description | Main files |
|---|---|---|
| 4.1 | Walkthrough (F8). | `package.json`, `media/walkthrough/*` |
| 4.2 | Workspace brain detector and status bar (F9). | `src/workspace/connected-brain.ts`, `src/views/status-bar.ts` |
| 4.3 | Cross-server search (F10). | `src/commands/search-commands.ts` |
| 4.4 | Capture lesson (F11). | `src/commands/lesson-commands.ts` |
| 4.5 | Hover provider (F12). | `src/links/hover-provider.ts` |

### Dependencies to add

- Extension host: `jsonc-parser`.
- Webview: `@milkdown/kit`, `@milkdown/react` (or the Tiptap equivalents after task 3.6).

---

## 8. Tests

All tests are vitest, colocated, and import the real module under test. Collaborators (`vscode`, `fetch`, `fs`, `child_process`, SecretStorage, Memento) are mocked or injected. No test re-implements the logic it checks. `src/__mocks__/vscode.ts` is extended with `TreeItem`, `ThemeIcon`, `EventEmitter` behaviour, `window.registerUriHandler`, `window.showQuickPick`/`showInputBox`, `workspace.getConfiguration`, `env.clipboard` and `env.uriScheme`.

### Phase 1

| Test file | What it exercises |
|---|---|
| `src/connection/connection.test.ts` (rewrite) | Add, rename, remove; duplicate URL rejected; URL normalisation and HTTPS rule; discovery failure messages; no supported provider yields `unsupportedAuth`; change events fire. |
| `src/auth/token-storage.test.ts` (rewrite) | Two storages with different ids do not see each other's sessions; `clear()` removes only its own blob; corrupt blob reads as signed out. |
| `src/api/api-client.test.ts` (extend) | Fixed base URL is used; 401 then refresh then retry; fetch rejection becomes `NetworkError`; two clients refresh independently. |
| `src/auth/auth-service.test.ts` (extend) | Refresh returns `ok`, `rejected` (401/403) and `unreachable` (fetch throws) on each of the three refresh paths; two services can sign in concurrently with separate state values. |
| `src/connection/session-manager.test.ts` | Sessions created and disposed with registry changes; timer refreshes each signed-in session; one session throwing does not stop the others; status transitions from section 4.4. |
| `src/connection/migration.test.ts` | Legacy cloud session; legacy Hive session; no legacy data; second run is a no-op; a failure part-way leaves legacy keys in place. |
| `src/connection/settings-servers.test.ts` | User-level entries merged and marked "Managed by settings"; removed entries dropped on change; invalid and non-HTTPS URLs skipped. |
| `src/views/servers-tree.test.ts` | Children, labels, descriptions and `contextValue` for every status; offline server shows cached brains; refresh event on status change. |
| `src/commands/server-commands.test.ts` | Add flow calls discovery then registry; remove asks for confirmation and deletes the session; sign-in provider selection. |
| `src/views/sidebar-provider.test.ts` (rewrite) | Messages are routed to the session named by `serverId`; unknown `serverId` returns an error message; 401 signs out only that server. |
| `src/mcp/mcp-config.test.ts` (extend) | URL built from the given server's `mcpBaseUrl`. |
| `webview-ui/src/App.test.tsx`, `pages/AccountPage.test.tsx` | Tabs render; server list reflects messages; sign-in form posts the right `serverId`. |

### Phase 2

| Test file | What it exercises |
|---|---|
| `src/mcp/naming.test.ts` | Slugging, length cut, non-ASCII names, collision suffix, output matches `^[a-z0-9_]+$`. |
| `src/mcp/json-config.test.ts` | Malformed JSON: nothing written, error returned; non-object root: nothing written; other entries preserved; temp-then-rename write; old-entry detection and rename. |
| `src/mcp/toml-append.test.ts` | Append to empty, to a file without trailing newline, to a file with other tables; same name and URL is a no-op; same name different URL refuses; inline `mcp_servers` refuses; original bytes are a prefix of the result. |
| `src/mcp/cli.test.ts` | Detection on PATH; arguments passed as an array; invalid name or URL rejected before spawn; non-zero exit reported. |
| `src/mcp/targets/claude-code.test.ts`, `codex.test.ts` | CLI used when present, file path otherwise; CLI failure falls back; login offer made. |
| `src/links/link.test.ts` | Build and parse round-trip for brain, neuron and (from phase 3) source-file links; wrapped form encodes correctly; bad version, bad GUID, HTTP non-localhost rejected; no token fields ever emitted. |
| `src/links/uri-handler.test.ts` | Known server opens; unknown server asks before any fetch; declined confirm contacts nothing; signed-out server triggers sign-in then open. |
| `src/workspace/jsonc-edit.test.ts` | Adds a recommendation while keeping comments; existing recommendation is a no-op; unparsable file untouched. |
| `src/workspace/checkpoint-block.test.ts` | Insert into a file without a block; replace an existing block only; both files; size under the limit; content outside markers byte-identical. |
| `src/commands/onboarding-commands.test.ts` | Each file change is confirmed; declining one skips only that file. |

### Phase 3

| Test file | What it exercises |
|---|---|
| `src/api/neuron-service.test.ts` (extend) | Create posts the cloud contract; Hive `404`/`405` marks create unsupported and is remembered; search uses the cloud route, and on Hive falls back to the cached list with the 60-second cache; get-by-id fallback scan. |
| `src/editor/selection-format.test.ts` | Fence language, fence escaping when the selection contains backticks, non-code files unfenced. |
| `src/workspace/git-remote.test.ts` | HTTPS, SSH and `git@` forms normalise to the same value; user, password and token removed; `origin` preferred; no remote and no Git extension handled. |
| `src/editor/source-reference.test.ts` | Plain form without a remote; link form with one; single line and range; nothing added when the toggle is off. |
| `src/links/open-file.test.ts` | Path with `..`, absolute path or drive letter rejected; matching workspace repo opens the file at the range; missing file reported; no match offers the four choices; chosen folder with a different remote refused; clone runs only after confirm. |
| `src/editor/agent-prompt.test.ts` | Prompt names the entry, tool and content; content with quotes is preserved. |
| `src/commands/insert-commands.test.ts`, `send-commands.test.ts` | Flows with mocked pickers and services; read-only brains excluded; nothing sent without the confirm; Hive fallback offered; source reference off by default and the choice remembered per workspace. |
| `src/views/neuron-conflict.test.ts` | Unchanged remote saves; changed remote prompts; each choice's outcome; base updated after save. |
| `src/views/neuron-editor-panel.test.ts` | One panel per neuron key; title carries server label and dirty marker; draft stored on dispose when dirty; save disabled when offline. |
| `webview-ui/src/editor/fidelity.test.ts` | Corpus round-trip (headings, lists, tables, code, mermaid, wiki links, raw HTML); guard chooses source mode when the round-trip differs. |
| `webview-ui/src/editor/EditorApp.test.tsx`, `reducer.test.ts` | Mode switch, dirty tracking, save message payload, read-only state. |

### Phase 4

| Test file | What it exercises |
|---|---|
| `src/workspace/connected-brain.test.ts` | Detects brains from `.mcp.json` and `.codex/config.toml` against known servers; ignores unknown hosts. |
| `src/views/status-bar.test.ts` | Text and visibility for none, one and several matches. |
| `src/commands/search-commands.test.ts` | Results grouped by server; one server timing out does not block others. |
| `src/commands/lesson-commands.test.ts` | Template pre-fill from selection and branch. |
| `src/links/hover-provider.test.ts` | URL recognition; cache; no fetch for signed-out servers. |

---

## 9. Cross-repo change requests

| File | Target | Summary | Priority |
|---|---|---|---|
| `docs/change-requests/cr-hive-server-extension-create-neuron.md` | `hive-server` | Add `POST /api/neurons` to the extension REST router, matching the cloud contract. Optional: `GET /api/neurons/{id}` and `GET /api/neurons/search`. | Medium |

The extension does not depend on it: it detects support at runtime and falls back. No change request is raised for SaaS, for Hive local-account sign-in (D7), or for anything else.

The existing `docs/change-requests/cr-platform-backend-brokered-auth-error-states.md` is unrelated and unchanged.

---

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Migration loses a session | User must sign in again | Idempotent migration; legacy data deleted last; tests for every legacy shape |
| Removing the webview Brains tab changes a familiar UI | Confusion on upgrade | CHANGELOG and Help text; welcome content in the tree; walkthrough in phase 4 |
| An outage is mistaken for an expired session | Unneeded sign-outs | Three-state refresh result; tokens kept when `offline` |
| Link assumptions fail | F2 less effective | Task 0.1 before build; fallback design defined |
| Crafted link adds a hostile server | Phishing through the sign-in page | Confirm with full host before any contact; HTTPS only; no automatic sign-in; `aiqbee.servers` is user-level only, so repos cannot add servers |
| A source reference exposes a private repo name or path in a shared brain | Information disclosure | Off by default; exact text previewed before sending; credentials stripped from remotes |
| Writing user-global agent config | Damage to unrelated settings | CLI first; append-only TOML; never write a file that fails to parse |
| CLI flags differ by version | Setup fails | Task 0.2; fallback to file writing; show command output |
| Editor rewrites Markdown | Silent content changes in shared brains | Fidelity guard, source mode, corpus tests |
| Editor bundle size | Slower install and load | Separate entry; spike with a budget; Tiptap fallback |
| No version or ETag for neurons | Lost updates in a narrow window | Compare-before-save; documented limit |
| Hive large brains with client-side search | Slow first search | Cache, progress, optional search route in the change request |
| Hive checkout researched was a month old | Some Hive facts may have moved | Re-check `devplatform/api/router.py` on current `develop` before phase 3 |
| Scope: twelve features | Long branch | One PR per phase; phases 3 and 4 can ship separately |

---

## 11. Open questions

None. The three questions raised during drafting are resolved:

- Removing the webview's Brains tab: accepted (D16).
- Workspace-level `aiqbee.servers`: not allowed; the setting is user-level only and F3 shares Hive servers through links instead (D10).
- Editor library: the spike's result is accepted without a further decision round (D17).

The Phase 0 verification tasks may still change the link design (F2) if the install-then-replay or redirect behaviour fails; the fallback is described in F2.
