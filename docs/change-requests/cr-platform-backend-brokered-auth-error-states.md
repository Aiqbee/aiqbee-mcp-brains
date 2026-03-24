# Change Request: Return Account State Errors in Cloud Brokered Auth Callback

**Date:** 2026-03-24
**Requested by:** Sean Davidson
**Priority:** High
**Target project:** `platform-backend-newux` (VscodeAuthController)

## Scope

This change request applies to the **cloud backend only** (`platform-backend-newux`). Hive Server already manages its own user accounts independently and does not need this change — hive users who encounter account issues should contact their hive administrator directly.

## Problem

When a user without an Aiqbee account tries to sign in via Google in the VS Code extension, the brokered auth callback (`GET /api/vscode/auth/callback`) currently fails silently or returns a generic error. The extension cannot distinguish between "no account exists" (`SignUpRequired`), "account pending approval" (`PendingApproval`), and other failures.

This only affects the **brokered Google auth flow** on the cloud backend. The direct Microsoft cloud flow already returns structured account states via the `POST /api/accounts/signin` response body (`AuthResponseDto.state`).

## Context

The VS Code extension now handles structured error states in the brokered auth callback redirect. When the backend redirects to `http://localhost:{port}/oauth/callback`, the extension checks for an `error` query parameter and maps known values (`SignUpRequired`, `PendingApproval`, `Disabled`) to actionable UI states. For `SignUpRequired` on cloud, the extension shows a "Sign up at the Aiqbee web app" button that opens the browser.

## Solution

When the `GET /api/vscode/auth/callback` endpoint processes the Google callback and determines the user's account state is not `Active`, redirect to the extension's localhost callback with structured error parameters instead of tokens.

### Redirect format for error states

```
http://localhost:{redirect_port}/oauth/callback?error={state}&error_description={message}&state={extension_state}
```

Where:
- `error` — the account state code: `SignUpRequired`, `PendingApproval`, or `Disabled`
- `error_description` — (optional) human-readable message; the extension has defaults for each known error code
- `state` — the original CSRF state from the extension (must always be returned for validation)

### Example redirects

**No account:**
```
http://localhost:62916/oauth/callback?error=SignUpRequired&state=abc123
```

**Pending approval:**
```
http://localhost:62916/oauth/callback?error=PendingApproval&error_description=Your+account+is+pending+approval&state=abc123
```

### Success redirect (unchanged)

```
http://localhost:{redirect_port}/oauth/callback?accessToken={jwt}&refreshToken={jwt}&state={state}
```

## Changes Required in platform-backend-newux

### Modify `VscodeAuthController` callback logic

After Google returns an authorization code and the backend exchanges it for Google tokens:

1. Look up the user's Aiqbee account using the Google identity (email/subject)
2. If no account exists → redirect with `?error=SignUpRequired&state={state}`
3. If account exists but state is `PendingApproval` → redirect with `?error=PendingApproval&state={state}`
4. If account exists but state is `Disabled` → redirect with `?error=Disabled&state={state}`
5. If account is `Active` → existing behaviour (redirect with tokens)

### What does NOT change

- `GET /api/vscode/auth/login` — unchanged
- `POST /api/vscode/auth/refresh` — unchanged
- Existing web UI auth flow — unchanged
- MCP auth flow — unchanged
- Token format/signing — unchanged

## Extension-Side Handling (already implemented)

The VS Code extension (`src/auth/auth-service.ts`) already parses these error parameters in `startBrokeredTokenServer`. Known error codes are mapped to `AuthStateError` exceptions, which the sidebar provider catches and displays as actionable messages. For cloud connections, a "Sign up" button links to the Aiqbee web app. For hive connections, only the error message is shown (no sign-up link, since hive manages accounts independently).

## Testing Checklist

- [ ] Google sign-in with no Aiqbee account → extension shows "sign up required" message with web app link
- [ ] Google sign-in with pending approval account → extension shows "pending approval" message
- [ ] Google sign-in with disabled account → extension shows "account disabled" message
- [ ] Google sign-in with active account → tokens received (regression)
- [ ] `state` parameter is always returned in error redirects (CSRF validation)
- [ ] Web UI Google login → still works (regression)
