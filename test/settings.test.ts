import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings } from '../src/settings.js';

let configHome: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (configHome) await rm(configHome, { recursive: true, force: true });
  configHome = undefined;
});

describe('language preferences', () => {
  it('persists language and display mode with private file permissions', async () => {
    configHome = await mkdtemp(join(tmpdir(), 'sysdoctor-config-'));
    vi.stubEnv('XDG_CONFIG_HOME', configHome);
    expect(await loadSettings()).toEqual({});
    await saveSettings({ language: 'de' });
    await saveSettings({ mode: 'advanced' });
    expect(await loadSettings()).toEqual({ language: 'de', mode: 'advanced' });
    expect(await readFile(join(configHome, 'sysdoctor', 'settings.json'), 'utf8'))
      .toContain('"language": "de"');
  });

  it('rejects an unsupported saved display mode', async () => {
    configHome = await mkdtemp(join(tmpdir(), 'sysdoctor-config-'));
    vi.stubEnv('XDG_CONFIG_HOME', configHome);
    await saveSettings({ language: 'en', mode: 'easy' });
    const path = join(configHome, 'sysdoctor', 'settings.json');
    await writeFile(path, '{"language":"en","mode":"power-user"}');
    await expect(loadSettings()).rejects.toThrow('Unsupported display mode');
  });
});
