import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLanguage, saveLanguage } from '../src/settings.js';

let configHome: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (configHome) await rm(configHome, { recursive: true, force: true });
  configHome = undefined;
});

describe('language preferences', () => {
  it('starts unset and persists a selected language with private file permissions', async () => {
    configHome = await mkdtemp(join(tmpdir(), 'sysdoctor-config-'));
    vi.stubEnv('XDG_CONFIG_HOME', configHome);
    expect(await loadLanguage()).toBeNull();
    await saveLanguage('de');
    expect(await loadLanguage()).toBe('de');
    expect(await readFile(join(configHome, 'sysdoctor', 'settings.json'), 'utf8'))
      .toContain('"language": "de"');
  });
});
