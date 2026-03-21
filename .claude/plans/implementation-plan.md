# Aiqbee Brain Manager — VS Code Extension Implementation Plan

## Context

This is a greenfield VS Code extension (empty repo with just README.md) that gives developers access to Aiqbee Brains from within VS Code. A PRD exists in the Aiqbee Product Management Brain (SPEC-VSCODE-001) defining 4 layers. This plan covers **Layers 1 + 2 + 4** (auth, brain browsing, MCP config generation) — the user's requested scope. Layer 3 (code capture) is deferred.

The brain builder (Electron/React) and frontend-newux (React SPA) provide reference auth patterns and API contracts. Five backend CRs (CR-001 to CR-005) are defined but **not yet implemented**, so we use existing API endpoints.

---

## Architecture

### Extension Type: Webview Sidebar + React

The user wants a grid of brain cards (max 8 columns), sign-in forms, and dialogs — this requires a **webview** (not native TreeView). The React app runs inside a `WebviewViewProvider` registered to the Activity Bar sidebar.

### Message Bridge Pattern

```
┌─────────────────┐     postMessage      ┌──────────────────┐
│  React Webview   │ ◄──────────────────► │  Extension Host   │
│  (UI only)       │                      │  (API + Auth)     │
│                  │                      │                   │
│  - Login form    │                      │  - API client     │
│  - Brain grid    │                      │  - SecretStorage  │
│  - Dialogs       │                      │  - MCP config gen │
└─────────────────┘                      └──────────────────┘
```

- Webview sends typed messages (e.g., `{ command: 'signIn', payload: {...} }`)
- Extension host handles API calls (avoids CORS), token storage, file writes
- Extension host posts results back to webview

### Styling: VS Code CSS Variables

Instead of MUI or Tailwind, use VS Code's native CSS variables (`--vscode-editor-background`, `--vscode-button-background`, etc.) so the extension matches any active theme. Lightweight custom CSS — no heavy UI framework needed.

---

## Project Structure

```
platform-vscode-extension/
├── src/                          # Extension host (TypeScript, esbuild)
│   ├── extension.ts              # activate/deactivate, register providers
│   ├── auth/
│   │   ├── auth-service.ts       # Microsoft + Google + Email auth flows
│   │   └── token-storage.ts      # VS Code SecretStorage wrapper
│   ├── api/
│   │   ├── api-client.ts         # HTTP client (fetch-based, auth headers, token refresh)
│   │   ├── brain-service.ts      # Brain CRUD + access listing
│   │   ├── neuron-service.ts     # Neuron/type/synapse count queries
│   │   ├── brain-template-service.ts
│   │   └── types.ts              # Shared DTOs (from brain builder types/)
│   ├── views/
│   │   └── sidebar-provider.ts   # WebviewViewProvider — loads React app
│   ├── mcp/
│   │   └── mcp-config.ts         # Write MCP connection to .claude/settings.json
│   └── commands/
│       └── commands.ts           # VS Code command registrations
│
├── webview-ui/                   # React webview app (Vite)
│   ├── src/
│   │   ├── main.tsx              # React entry point
│   │   ├── App.tsx               # Router: Login → Brains
│   │   ├── hooks/
│   │   │   └── useVsCode.ts      # postMessage bridge hook
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx     # Sign-in (Microsoft, Google, Email)
│   │   │   ├── SignUpPage.tsx    # Create Account (inline registration)
│   │   │   └── BrainsPage.tsx    # Brain grid + Create Brain dialog
│   │   ├── components/
│   │   │   ├── BrainCard.tsx     # Brain panel (name, desc, counts, MCP button)
│   │   │   ├── CreateBrainDialog.tsx
│   │   │   ├── Spinner.tsx
│   │   │   └── Button.tsx        # VS Code-styled button
│   │   └── styles/
│   │       └── index.css         # VS Code CSS variable theme
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── .claude/
│   └── settings.json             # MCP brain connection for this project
├── .vscode/
│   └── launch.json               # F5 debug config for Extension Development Host
├── .env.eudev                    # Dev environment (api.aiqbee.dev)
├── .env.euprod                   # Prod environment (api.aiqbee.com)
├── .vscodeignore                 # Exclude source from VSIX package
├── package.json                  # Extension manifest (contributes, activationEvents)
├── tsconfig.json
├── esbuild.js                    # Extension bundler
├── CLAUDE.md                     # Lean brain-connected CLAUDE.md
└── tasks/
    ├── todo.md
    └── log.md
```

---

## Implementation Steps

### Phase 0: Project Scaffolding

1. **package.json** — Extension manifest with:
   - `contributes.viewsContainers.activitybar` → Aiqbee icon on left sidebar
   - `contributes.views.aiqbee-sidebar` → webview view
   - `contributes.commands` → sign in, sign out, refresh, add MCP
   - `activationEvents` → `onView:aiqbee-sidebar`
   - Dependencies: `@vscode/vsce` (packaging)
   - Dev deps: `esbuild`, `typescript`, `@types/vscode`

2. **tsconfig.json** — Strict TypeScript, ES2022 target

3. **esbuild.js** — Bundle extension host to single file

4. **webview-ui/** — Vite + React 18 + TypeScript scaffold
   - Output to `dist/webview/` for embedding in extension

5. **.vscodeignore** — Exclude source, include only dist/

### Phase 1: Authentication (Layer 1)

**Auth Service** (`src/auth/auth-service.ts`):
- **Microsoft**: Use VS Code built-in `vscode.authentication.getSession('microsoft', scopes)` — this leverages the Microsoft Authentication extension that ships with VS Code. Scopes from brain builder env: `api://3f91729c-d752-498b-8b12-c2552c31d10e/user.access` (dev) / `api://9935edc3-c4c8-4cff-b3d9-6089096a9579/user.access` (prod)
- **Google**: Custom OAuth via VS Code URI handler — open browser, capture redirect via `vscode://<publisher>.<extension>/oauth/callback`
- **Email/Password**: Webview form → postMessage to extension host → `POST /api/auth/email/login`
- Token exchange: Send OAuth token to Aiqbee API (`POST /api/accounts/signin` for Microsoft, `POST /api/auth/google` for Google)

**Token Storage** (`src/auth/token-storage.ts`):
- Use `context.secrets` (VS Code SecretStorage API — OS keychain-backed)
- Store: `aiqbee-access-token`, `aiqbee-refresh-token`, `aiqbee-auth-type`, `aiqbee-api-url`
- Token refresh: call `/api/auth/refresh` on 401, same pattern as brain builder

**Login Page** (`webview-ui/src/pages/LoginPage.tsx`):
- Three auth buttons: Microsoft, Google, Email/Password
- Email/password form (expandable)
- "Create Account" — inline registration form in the webview using existing `/api/auth/email/register` endpoint. Fields: email, password, given name, family name, tenant name, job title. Adapted from brain builder signup flow.
- Environment selector (dev/prod) — stored in VS Code settings
- Adapted from brain builder `src/renderer/pages/login.tsx`

### Phase 2: Brain Browser (Layer 2)

**API Client** (`src/api/api-client.ts`):
- Adapted from brain builder `src/renderer/services/api-client.ts`
- `fetch`-based (Node.js built-in, no axios needed)
- Auto-inject `Authorization: Bearer {token}`
- Auto-refresh on 401 with deduplication
- Base URL determined by build environment (see Environment Config below)

**Brain Service** (`src/api/brain-service.ts`):
- `listBrains()` → `GET /api/brains/with-access` (existing endpoint)
- `createBrain(data)` → `POST /api/brains` (existing endpoint)
- `getBrainTemplates()` → `GET /api/brain-templates` (existing endpoint)

**Neuron Service** (`src/api/neuron-service.ts`):
- `getNeuronCount(brainId)` → `GET /api/neurons?brainId={id}&pageSize=1` (use total from pagination)
- `getNeuronTypeCount(brainId)` → `GET /api/neuron-types?brainId={id}&pageSize=1`
- `getSynapseCount(brainId)` → `GET /api/synapses?brainId={id}&pageSize=1`
- Counts fetched per-brain after listing (parallelize with Promise.all)

**Brains Page** (`webview-ui/src/pages/BrainsPage.tsx`):
- Responsive grid: max 8 columns on full-width, auto-fit with CSS Grid `repeat(auto-fill, minmax(200px, 1fr))`
- Each **BrainCard** shows:
  - Brain name (bold)
  - Description (truncated, 2 lines)
  - Stats row: neurons, types, synapses
  - "Add MCP Connection" button at bottom
  - Access level badge (Read / ReadWrite / Owner)
- "New Brain" card/button at the top
- Pull-to-refresh / refresh button

**Create Brain Dialog** (`webview-ui/src/components/CreateBrainDialog.tsx`):
- Fields: Name (required), Description (optional), Template dropdown (optional), Personal/Org toggle
- Adapted from brain builder `src/renderer/pages/brain-selection.tsx` create dialog
- On success: refreshes brain list, shows toast

### Phase 3: MCP Config Generation (Layer 4)

**MCP Config Writer** (`src/mcp/mcp-config.ts`):

When user clicks "Add MCP Connection" on a brain card:

1. Detect workspace root (if no workspace open, prompt user to open a folder first)
2. Show quick pick: "Where should the MCP connection be added?"
   - `.claude/settings.json` (Claude Code)
   - `.mcp.json` (Generic MCP — Cursor, etc.)
3. Read or create the selected config file
4. Add/update MCP server entry:
```json
{
  "mcpServers": {
    "Aiqbee Brain: {brainName}": {
      "command": "npx",
      "args": [
        "-y", "@anthropic-ai/claude-code-mcp-server",
        "--brain-id={brainId}"
      ]
    }
  }
}
```
5. Show VS Code info notification: "MCP connection added for {brainName}"

### Phase 4: CLAUDE.md + Brain Migration

Following the **Recipe: Migrate Project to Brain + CLAUDE.md Workflow**:

1. Create lean `CLAUDE.md` with:
   - Product identity: "Aiqbee Brain Manager VS Code Extension"
   - Quality standard reference
   - Brain search trigger table (Development Practice + Recipe neurons only)
   - Brain maintenance rules
   - MCP install snippet
   - Git workflow (branch from develop, PR, CodeRabbit, merge)
   - Quick rules and essential commands

2. Create `tasks/todo.md` and `tasks/log.md`

3. Connect MCP in `.claude/settings.json`:
```json
{
  "mcpServers": {
    "Aiqbee Product Management Brain": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/claude-code-mcp-server",
               "--brain-id=f68cbb68-a935-46c5-bc29-16477d05b2d1"]
    }
  }
}
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI approach | React webview (not TreeView) | Grid layout, rich cards, dialogs require HTML/CSS |
| Styling | VS Code CSS variables | Matches any user theme automatically |
| Auth (Microsoft) | VS Code built-in auth API | Zero-config, handles token refresh, trusted by users |
| Auth (Google) | URI handler OAuth flow | Standard VS Code pattern for non-Microsoft OAuth |
| Auth (Email) | Webview form + API call | Simple, works within existing webview |
| Token storage | VS Code SecretStorage | OS keychain-backed, same security as brain builder |
| API client | Native fetch (Node 18+) | No external HTTP dependency needed |
| Extension bundler | esbuild | Fast, recommended by VS Code team |
| Webview bundler | Vite | Consistent with Aiqbee projects, fast HMR for dev |
| MCP config target | User chooses (.claude/settings.json or .mcp.json) | Supports Claude Code and Cursor/other MCP clients |
| "Create Account" | Inline webview registration form | More integrated UX; uses existing /api/auth/email/register |
| State management | React useState/useReducer | Simple enough; no Zustand/MobX needed for sidebar |

---

## Existing Code to Adapt

| Source | File | Reuse |
|--------|------|-------|
| Brain Builder | `src/renderer/services/api-client.ts` | API client pattern (auth headers, refresh, error handling) |
| Brain Builder | `src/renderer/services/brain-service.ts` | Brain CRUD endpoints |
| Brain Builder | `src/renderer/services/neuron-service.ts` | Neuron/type/synapse endpoints |
| Brain Builder | `src/renderer/services/brain-template-service.ts` | Template listing |
| Brain Builder | `src/renderer/types/` | DTO interfaces (BrainDto, UserDto, AuthResponseDto) |
| Brain Builder | `src/renderer/pages/login.tsx` | Login UI layout reference |
| Brain Builder | `src/renderer/pages/brain-selection.tsx` | Brain grid + create dialog reference |
| Brain Builder | `src/renderer/stores/auth-store.ts` | Auth state machine (states, transitions) |
| Brain Builder | `.env.eudev`, `.env.euprod` | API URLs, OAuth client IDs |

---

## Environment Config & CI/CD

Two build environment configs, matching the brain builder pattern:

| Config | File | API URL | Branch | Purpose |
|--------|------|---------|--------|---------|
| Dev | `.env.eudev` | `https://api.aiqbee.dev` | `develop` | Development & testing |
| Prod | `.env.euprod` | `https://api.aiqbee.com` | `master` | Production releases |

Each env file contains:
- `VITE_API_URL` — API base URL
- `VITE_MSAL_CLIENT_ID` — Microsoft auth client ID
- `VITE_ENTRA_SCOPES` — Entra ID scopes
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID

**Build scripts:**
- `npm run compile:dev` → esbuild + vite build with `--mode eudev`
- `npm run compile:prod` → esbuild + vite build with `--mode euprod`
- `npm run package:dev` → vsce package with dev config
- `npm run package:prod` → vsce package with prod config

**CI/CD** (GitHub Actions):
- Push to `develop` → build with `.env.eudev`, publish to pre-release channel
- Push to `master` → build with `.env.euprod`, publish to VS Code Marketplace

---

## Verification

1. **Build**: `npm run compile` succeeds for both extension and webview
2. **Launch**: F5 in VS Code opens Extension Development Host with Aiqbee icon in Activity Bar
3. **Auth**: Sign in with Microsoft → token stored in SecretStorage → brain list loads
4. **Brain grid**: Shows brains with correct names, descriptions, and counts
5. **Create brain**: Dialog opens, creates brain via API, appears in grid
6. **MCP config**: Click "Add MCP Connection" → config file updated in workspace
7. **Theme**: Switch VS Code theme (light/dark) → extension UI follows
