## Task: Build Aiqbee Brain Manager VS Code Extension
Date: 2026-03-20

### Objective
A working VS Code extension with sidebar icon, sign-in (Microsoft/Google/Email), brain grid with counts, create brain dialog, and MCP config generation. Follows SPEC-VSCODE-001 Layers 1, 2, and 4.

### Steps
- [x] Phase 0: Project scaffolding (package.json, tsconfig, esbuild, webview-ui Vite+React, .vscode launch/tasks, env configs)
- [x] Phase 1a: Extension host auth (token-storage.ts, auth-service.ts with Microsoft/Google/Email)
- [x] Phase 1b: API layer (api-client.ts with auth headers + refresh, brain-service.ts, neuron-service.ts)
- [ ] Phase 1c: Webview React app (LoginPage, SignUpPage)
- [ ] Phase 2a: Sidebar provider (WebviewViewProvider, message bridge)
- [ ] Phase 2b: Brain browser UI (BrainsPage, BrainCard, CreateBrainDialog)
- [ ] Phase 2c: Extension entry point (extension.ts — wire everything together)
- [ ] Phase 3: MCP config generation (mcp-config.ts — done, wire to commands)
- [ ] Phase 4: CLAUDE.md + brain migration (lean CLAUDE.md, .claude/settings.json MCP connection)
- [ ] Verify: Build succeeds, extension loads in Extension Development Host

### Risks / Unknowns
- Backend CRs (CR-001 to CR-005) not yet implemented — using existing API endpoints
- Google OAuth redirect handling in VS Code URI handler needs testing
- VS Code built-in Microsoft auth scope compatibility with Aiqbee API needs verification

### Architecture
See `.claude/plans/implementation-plan.md` for full architecture details.
