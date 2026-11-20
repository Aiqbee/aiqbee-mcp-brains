import * as vscode from 'vscode';
import { normaliseUrl } from './connection.js';

export const SERVERS_SETTING = 'servers';

export interface SettingServer {
  /** Normalised base URL. */
  url: string;
  label?: string;
}

/**
 * Read the aiqbee.servers setting. It is contributed with application scope,
 * so VS Code only takes it from user settings; to be safe this also reads
 * only the global value, never a workspace or folder value. Invalid entries
 * and duplicates are skipped and reported through `onInvalid`.
 */
export function readSettingServers(
  config: Pick<vscode.WorkspaceConfiguration, 'inspect'>,
  onInvalid: (entry: unknown, reason: string) => void = () => undefined,
): SettingServer[] {
  const raw = config.inspect<unknown>(SERVERS_SETTING)?.globalValue;
  if (!Array.isArray(raw)) {
    return [];
  }

  const result: SettingServer[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const url = typeof item === 'string' ? item : (item as { url?: unknown })?.url;
    const label = typeof item === 'object' && item !== null ? (item as { label?: unknown }).label : undefined;
    if (typeof url !== 'string' || !url.trim()) {
      onInvalid(item, 'missing url');
      continue;
    }
    let normalised: string;
    try {
      normalised = normaliseUrl(url);
    } catch (err) {
      onInvalid(item, err instanceof Error ? err.message : String(err));
      continue;
    }
    const key = normalised.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      url: normalised,
      label: typeof label === 'string' && label.trim() ? label.trim() : undefined,
    });
  }
  return result;
}
