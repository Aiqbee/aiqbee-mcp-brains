/**
 * Read the expiry (`exp`, in ms since the epoch) from a JWT without verifying
 * it. Used only to decide when to refresh; the server still validates every
 * token. Returns undefined for opaque or malformed tokens.
 */
export function tokenExpiresAt(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return undefined;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
