# Contributing to Aiqbee MCP Brains

Thank you for your interest in contributing! We welcome bug reports, feature suggestions, and code contributions.

## Code of Conduct

Be respectful and constructive. We're building something useful together.

## Reporting Bugs

1. Check [existing issues](https://github.com/aiqbee/aiqbee-mcp-brains/issues) first.
2. Open a new issue using the **Bug Report** template.
3. Include VS Code version, extension version, OS, and steps to reproduce.

## Suggesting Features

Open an issue using the **Feature Request** template. Describe the problem you're solving, not just the solution you want.

## Submitting Code

### Prerequisites

- Node.js 18+
- VS Code 1.85+

### Setup

```bash
git clone https://github.com/aiqbee/aiqbee-mcp-brains.git
cd aiqbee-mcp-brains
npm install
cd webview-ui && npm install && cd ..
npm run compile
```

### Development Workflow

1. **Fork** the repository and clone your fork.
2. **Branch** from `develop` — use `feature/<name>` or `fix/<name>`.
3. **Build** with `npm run compile` (extension + webview).
4. **Test** by pressing F5 in VS Code to launch the Extension Development Host.
5. **Watch** with `npm run watch` (extension) and `cd webview-ui && npm run dev` (webview) for live reload.
6. **Submit a PR** to `develop` — never directly to `master`.

### Build Commands

| Command | Description |
|---|---|
| `npm run compile` | Build extension + webview (dev) |
| `npm run watch` | Watch extension (esbuild) |
| `cd webview-ui && npm run dev` | Vite dev server for webview |
| `npm run compile:prod` | Production build |
| `npm run package:dev` | Package VSIX (dev env) |
| `npm run package:prod` | Package VSIX (prod env) |

### Project Structure

```
src/                    Extension host (TypeScript)
  api/                  API client, brain/neuron services
  auth/                 Auth service (Entra, Google, email)
  mcp/                  MCP config writer
  views/                Sidebar provider, graph panel
webview-ui/             React webview (Vite + React 18)
  src/pages/            Login, SignUp, Brains, Help, Prompts
  src/components/       BrainCard, CreateBrainDialog
media/                  Icons, logos, force-graph library
```

### PR Requirements

- Self-review before submitting (dead code, duplicates, bad practices).
- Use VS Code CSS variables for theming — no external CSS frameworks.
- Extension host handles all API calls; webview communicates via `postMessage`.
- Keep PRs focused — one feature or fix per PR.

## Contributor License Agreement

External contributors must sign our [CLA](CLA.md) before we can merge. The CLA bot will prompt you automatically on your first PR.

## Questions?

Open an issue or reach out at [aiqbee.com](https://www.aiqbee.com).
