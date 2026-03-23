# Aiqbee Brain Manager — VS Code Extension

**Product:** Aiqbee Brain Manager VS Code Extension
**Repo:** platform-vscode-extension
**Stack:** TypeScript, React 18, Vite, esbuild, VS Code Extension API

## Quality Standard

Work to senior developer standards. Fix problems immediately — don't defer with TODOs.

## Knowledge Base (Aiqbee Brain via MCP)

If you have access to the **Aiqbee Product Development Brain** via MCP, search it before starting work — it contains detailed practices, patterns, lessons learned, and code review checklists for this project. Key search terms: `agentic planning protocol`, `VS Code extension`, `authentication`, `api client`, `code review checklist`, `lesson learned`, `cross-repository change requests`.

If the brain is not connected, the key practices are summarised below.

## Key Development Practices

- **Plan before coding** — for tasks with 3+ steps, outline your approach before writing code
- **Self-review before commit** — check for dead code, duplicates, security issues, and adherence to patterns below
- **Code review checklist** — no hardcoded secrets, proper error handling, tests for new logic, consistent naming
- **Cross-repo changes** — document change requests in `docs/change-requests/` when backend changes are needed
- **Lessons learned** — when fixing non-obvious bugs, document the problem, what didn't work, and the correct approach

## Git Workflow

1. Branch from `develop` — `feature/<name>` or `fix/<name>`
2. Self-review before commit (dead code, duplicates, bad practices)
3. PR to `develop` — never push directly
4. Wait for CodeRabbit review and CI/CD checks before merging
5. Never squash merge — `gh pr merge --merge --delete-branch`

## Architecture Rules

- VS Code CSS variables for theming (not MUI, not Tailwind)
- Extension host handles all API calls (webview sends messages via `postMessage`)
- VS Code `SecretStorage` for token persistence
- Two env configs: `.env.eudev` (develop) / `.env.euprod` (master)
- React `useState`/`useReducer` for webview state (no external state lib)
- OAuth flows use PKCE + CSRF state validation
- Connection abstraction (`ConnectionManager`) supports both cloud and self-hosted (Hive Server) backends

## Essential Commands

```bash
npm install                    # Install extension deps
cd webview-ui && npm install   # Install webview deps
npm run compile                # Build extension + webview
npm run watch                  # Watch extension (esbuild)
cd webview-ui && npm run dev   # Vite dev server for webview
npm run package:dev            # Package VSIX (dev env)
npm run package:prod           # Package VSIX (prod env)
npm test                       # Run tests (vitest)
```

## Publishing

- Marketplace publish is triggered by pushing a `v*` tag to master (see `.github/workflows/release.yml`)
- To publish: merge to master, then `npm version patch && git push && git push --tags`
- The VS Code Marketplace PAT is stored as an encrypted GitHub Actions secret
