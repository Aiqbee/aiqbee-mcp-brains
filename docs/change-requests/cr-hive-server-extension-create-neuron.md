# Change Request: Create Neuron Endpoint on the Hive Extension REST API

**Date:** 2026-11-20
**Requested by:** Sean Davidson
**Priority:** Medium
**Target project:** `hive-server` (`devplatform/api/router.py`, `devplatform/api/schemas.py`)

## Scope

This change request applies to **Hive Server only**. The cloud backend (`platform-backend-newux`) already exposes `POST /api/neurons` and needs no change. No change is requested to MCP, the web UI, the management API (`/api/v1`), authentication, or the database schema.

## Problem

The VS Code extension talks to Hive Server through the `/api` router using its own HS256 token (audience `hive-vscode-ext`). That router can list and update neurons but cannot create one:

| Operation | Cloud (`NeuronsController`) | Hive (`devplatform/api/router.py`) |
|---|---|---|
| List neurons | `GET /api/neurons` | `GET /api/neurons` |
| Update neuron | `PUT /api/neurons/{id}` | `PUT /api/neurons/{id}` |
| Create neuron | `POST /api/neurons` | **missing** |
| Get neuron by id | `GET /api/neurons/{id}` | missing (optional, see below) |
| Search neurons | `GET /api/neurons/search` | missing (optional, see below) |

The extension token is not accepted by the MCP endpoints (they validate Entra, Google or `hive-mcp`-audience tokens) or by `/ui-api/*` (cookie session), so the extension has no way to create a neuron on a Hive Server.

## Context

The extension is adding "send selection to a brain as a new neuron", a neuron editor with "new neuron", and "capture lesson". On cloud these call `POST /api/neurons`. On Hive, until this change lands, the extension offers only "update or append to an existing neuron" plus a copied agent prompt that names the MCP tool `aiqbee_create_neuron`.

The extension detects support at runtime: it calls `POST /api/neurons` and treats `404` or `405` as "not supported on this server", then falls back. No discovery change is required.

## Solution

Add `POST /api/neurons` to the existing extension router, matching the cloud contract as closely as the Hive model allows.

### Request

```
POST /api/neurons
Authorization: Bearer <extension access token>
Content-Type: application/json

{
  "brainId": "<uuid>",
  "neuronTypeId": "<uuid>",
  "name": "Short title",
  "content": "Markdown body",
  "contentDate": "2026-11-20"
}
```

- `brainId`, `neuronTypeId`, `name` are required. `content` defaults to an empty string.
- `contentDate` is optional (`YYYY-MM-DD`). The cloud `NeuronCreateDto` has it; accept it if the Hive model supports it and ignore it otherwise.
- Field names are camelCase, as on the rest of this router and on cloud.

### Response

`200 OK` with the existing `NeuronDto` shape (`id`, `name`, `content`, `brainId`, `neuronTypeId`, `neuronTypeName`, `createdDate`, `modifiedDate`). `201 Created` is equally acceptable; the extension accepts any 2xx.

### Errors

Use the same rules the router already applies to `PUT /api/neurons/{id}`:

| Case | Status |
|---|---|
| Malformed `brainId` or `neuronTypeId` | `400` |
| Caller has no access to the brain | `404` (same existence contract as the other routes) |
| Caller can read the brain but has no write access | `403` |
| `neuronTypeId` does not belong to `brainId` | `400` |
| Caller lacks write access to a type-secured NeuronType | `403` |
| Licence or neuron limit reached | `400` with the structured body the extension already parses (`errorCode`, `message`, `currentCount`, `maxAllowed`) |

## Changes Required in hive-server

### Add a create schema

In `devplatform/api/schemas.py`, add `NeuronCreateDto` (`brainId`, `neuronTypeId`, `name`, `content`, optional `contentDate`).

### Add the route

In `devplatform/api/router.py`, add `@router.post("/neurons", response_model=NeuronDto)` that:

1. Parses the ids with `_parse_uuid`.
2. Checks brain access with `access_svc.get_effective_access_level` (none → `404`; not `read_write` or `owner` → `403`).
3. Checks the target type with `_target_type_is_in_brain` and `access_svc.can_principal_access_neuron(..., require_write=True)`, the same checks `update_neuron` runs when a neuron is re-typed.
4. Calls the existing `neuron_svc.create_neuron(...)`, so embeddings, content hash, metadata defaults and audit logging behave exactly as they do for `aiqbee_create_neuron` and the web UI.
5. Returns `NeuronDto`.

Whether `Brain.allow_mcp_editing` should block this route is a Hive decision. The existing `PUT /api/neurons/{id}` route should be the guide: do whatever it does, so create and update agree.

### Optional, only if trivially adjacent

These are not required. The extension works without them by paging `GET /api/neurons` and filtering client-side.

- `GET /api/neurons/{neuron_id}` returning `NeuronDto`, with the same read checks (`404` when unreadable). Saves fetching the whole brain to open or conflict-check one neuron.
- `GET /api/neurons/search?brainId=&searchTerm=&pageNumber=&pageSize=` returning the same paginated shape as `GET /api/neurons`, backed by `neuron_svc.search_neurons` with the per-type read filter applied. Matches the cloud route's required parameters.

### What does NOT change

- `GET /api/vscode/discovery`, `GET /api/vscode/auth/login`, `POST /api/vscode/auth/refresh` — unchanged
- Existing `/api` routes (`brains/with-access`, `brains`, `brain-templates`, `neurons` list and update, `neuron-types`, `synapses`) — unchanged
- MCP endpoints, MCP token validation, MCP tools and prompts — unchanged
- Web UI, `/ui-api/*`, session auth — unchanged
- Management API `/api/v1/*` — unchanged
- Token format, signing and audience — unchanged
- Database schema — no migration

## Extension-Side Handling

- `src/api/neuron-service.ts` gains `createNeuron()` which posts to `/api/neurons` on every server type.
- A `404` or `405` from a Hive Server marks that server as "create not supported" for the session. The extension then offers "append to an existing neuron" and "copy agent prompt" (a plain prompt naming `aiqbee_create_neuron`, the brain and the content).
- Once a Hive Server has this endpoint, the same extension build starts using it with no update needed.
- If the optional routes exist, the extension uses them; if they return `404` or `405` it falls back to the paged list.

## Testing Checklist

- [ ] Owner or read-write user creates a neuron → `2xx`, `NeuronDto` returned, neuron visible in the web UI and via `aiqbee_fetch`
- [ ] Created neuron is searchable (embedding generated as for other create paths)
- [ ] Read-only user → `403`, nothing created
- [ ] User with no brain access → `404`, body identical to a non-existent brain
- [ ] `neuronTypeId` from another brain → `400`
- [ ] Type-secured NeuronType without a write grant → `403`
- [ ] Audit log records the create when brain auditing is on
- [ ] Malformed UUIDs → `400`
- [ ] Missing or invalid bearer token → `401`
- [ ] Existing `GET /api/neurons` and `PUT /api/neurons/{id}` → unchanged (regression)
- [ ] MCP `aiqbee_create_neuron` → unchanged (regression)
