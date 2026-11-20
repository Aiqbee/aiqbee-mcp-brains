## Task: Multi-server enhancements — Phase 1 (sidebar fix + multi-server)
Date: 2026-11-20
Branch: `feature/multi-server-enhancements`
Spec: [docs/specs/multi-server-enhancements.md](../docs/specs/multi-server-enhancements.md) (sections 4, 5, 7, 8)

### Objective
Sign in to Aiqbee Cloud and any number of Hive Servers at the same time, shown as servers with their brains in a native VS Code tree. Fix the sidebar so the webview fills its width. Existing users keep their session after upgrade.

### Phase 0 status
- [x] 0.2 `claude mcp add` flags recorded (always pass `--scope`; Codex CLI not installed — documented syntax kept)
- [x] 0.3 Version: published 0.2.7; no change on this branch
- [ ] 0.1a Manual link test (user) — blocks Phase 2 F2 only
- [ ] 0.1b Replay test — after task 2.8 ships in a pre-release

### Steps (Phase 1)
- [x] 1.1 Sidebar CSS: `#root` cap removed, `min-width: 0` on `.tab-content`, sign-in panel and add-server form capped at 420px
- [x] 1.2 `ServerEntry` model + `ConnectionManager` registry (add/rename/remove, duplicate URL rule, HTTPS-unless-localhost, no-provider servers kept, change/remove events)
- [x] 1.3 Server-scoped `TokenStorage` (one session blob per server id, serialised updates)
- [x] 1.4 `ApiClient` with fixed base URL and `NetworkError`
- [x] 1.5 `AuthService` per server; refresh returns `ok | rejected | unreachable`
- [x] 1.6 `ServerSession` + `SessionManager`; one timer refreshing each session independently
- [x] 1.7 Migration from legacy `aiqbee-connection` + four legacy secrets
- [x] 1.8 `aiqbee.servers` setting, user-level only (`"scope": "application"`, reads `globalValue` only)
- [x] 1.9 `ServersTreeProvider`: status nodes, cached brains when offline, retry on load errors, welcome content, lazy tooltips
- [x] 1.10 Commands: addServer, renameServer, removeServer, signIn, signOut, cancelSignIn, refresh, createBrain, openBrainGraph, addMcpConnection, openInWebApp, signUp
- [x] 1.11 Webview → Account / Help / Prompts; every data message carries `serverId`; BrainsPage, BrainCard, CreateBrainDialog, LoginPage removed
- [x] 1.12 Graph panel keyed by `serverId:brainId`; server label in title when >1 server; read-only banner on sign-out; closed on removal
- [x] 1.13 MCP URL from the brain's server `mcpBaseUrl`
- [x] 1.14 README, CHANGELOG, Help page text
- [x] Review-and-refactor pass (fixed: manual refresh did not reconnect a stored session after a server regained a sign-in method)
- [x] Verify: `npm run compile`, `npm test` (182), webview tests (20), `tsc --noEmit` clean in both projects, VSIX packages
- [ ] Manual check in the Extension Development Host against spec 4.11 acceptance criteria and the section 5 width checks (needs a person at the UI)

### Notes
- `docs/**` is now excluded from the VSIX (the spec and change requests were being packaged).
- Fixed the pre-existing `tsc` error in `src/mcp/mcp-config.test.ts` (top-level await).
