# Aiqbee Brain Manager — VS Code Extension

**Product:** Aiqbee Brain Manager VS Code Extension
**Repo:** platform-vscode-extension
**Stack:** TypeScript, React 18, Vite, esbuild, VS Code Extension API

## Quality Standard

Work to senior developer standards. Fix problems immediately — don't defer with TODOs.

## Brain Search Triggers

Before coding, search the Aiqbee Product Management Brain for relevant practices:

| When you are... | Search for |
|---|---|
| Starting any task (3+ steps) | `agentic planning protocol` |
| Making a UI change | `VS Code extension`, `UI pattern` |
| Working with authentication | `authentication`, `MSAL`, `token` |
| Creating or modifying API calls | `api client`, `service pattern` |
| About to commit or create a PR | `code review checklist` |
| Solving a difficult bug | `lesson learned`, `recipe`, `non-obvious fix` |
| Making cross-repo changes | `cross-repository change requests` |
| Setting up CI/CD | `CI/CD pipeline`, `release` |

## Brain Maintenance

- **Bug fixed** — update or create a neuron noting the fix and pattern learned
- **Feature added** — update the VS Code Extension product neuron
- **New practice discovered** — create a Development Practice neuron
- **Lesson learned** — create a Development Recipe neuron (problem → what didn't work → correct approach)
- After any correction from user: proactively offer to add a lesson to the brain

## MCP Connection

The Aiqbee Product Development Brain is connected globally via user-level Claude settings. No project-level MCP config needed.

## Git Workflow

1. Branch from `develop` — `feature/<name>` or `fix/<name>`
2. Self-review before commit (dead code, duplicates, bad practices)
3. PR to `develop` — never push directly
4. Never squash merge — `gh pr merge --merge --delete-branch`

## Quick Rules

- VS Code CSS variables for theming (not MUI, not Tailwind)
- Extension host handles all API calls (webview sends messages via postMessage)
- VS Code SecretStorage for token persistence
- Two env configs: `.env.eudev` (develop) / `.env.euprod` (master)
- React useState/useReducer for webview state (no external state lib)

## Essential Commands

```bash
npm install                    # Install extension deps
cd webview-ui && npm install   # Install webview deps
npm run compile                # Build extension + webview
npm run watch                  # Watch extension (esbuild)
cd webview-ui && npm run dev   # Vite dev server for webview
npm run package:dev            # Package VSIX (dev env)
npm run package:prod           # Package VSIX (prod env)
```

## Publishing

- **VSCE_PAT** is stored as an encrypted GitHub Actions secret (repo Settings → Secrets → Actions)
- Marketplace publish is triggered by pushing a `v*` tag to master (see `.github/workflows/release.yml`)
- To publish: merge to master, then `npm version patch && git push && git push --tags`
- PAT was created in Azure DevOps under the Aiqbee organization — rotate annually

## New Session Checklist

1. Read `tasks/log.md` for recent context
2. Read `tasks/todo.md` for current plan
3. Search brain for relevant practices before starting work
