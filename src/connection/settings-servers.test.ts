import { describe, it, expect, vi } from 'vitest';
import { readSettingServers } from './settings-servers.js';

function config(values: { globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown }) {
  return { inspect: vi.fn().mockReturnValue({ key: 'aiqbee.servers', ...values }) } as any;
}

describe('readSettingServers', () => {
  it('reads URL strings and objects from user settings, normalising URLs', () => {
    const result = readSettingServers(config({
      globalValue: ['hive.example.com/', { url: 'https://other.example.com', label: ' Other ' }],
    }));

    expect(result).toEqual([
      { url: 'https://hive.example.com', label: undefined },
      { url: 'https://other.example.com', label: 'Other' },
    ]);
  });

  it('never reads workspace or folder values', () => {
    const result = readSettingServers(config({
      workspaceValue: ['evil.example.com'],
      workspaceFolderValue: ['evil2.example.com'],
    }));
    expect(result).toEqual([]);
  });

  it('skips invalid and non-HTTPS entries and reports them', () => {
    const onInvalid = vi.fn();
    const result = readSettingServers(
      config({ globalValue: ['http://insecure.example.com', { label: 'no url' }, 42, 'ok.example.com'] }),
      onInvalid,
    );

    expect(result).toEqual([{ url: 'https://ok.example.com', label: undefined }]);
    expect(onInvalid).toHaveBeenCalledTimes(3);
  });

  it('drops duplicates', () => {
    const result = readSettingServers(config({
      globalValue: ['hive.example.com', 'HTTPS://HIVE.EXAMPLE.COM/'],
    }));
    expect(result).toHaveLength(1);
  });

  it('returns nothing when the setting is not an array', () => {
    expect(readSettingServers(config({ globalValue: 'hive.example.com' }))).toEqual([]);
    expect(readSettingServers(config({}))).toEqual([]);
  });
});
