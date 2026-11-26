import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { languages, type Language } from './i18n.js';

export type DisplayMode = 'easy' | 'advanced';

export interface Settings {
  language?: Language;
  mode?: DisplayMode;
}

function settingsPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(configHome, 'sysdoctor', 'settings.json');
}

export function detectLanguage(): Language {
  const locale = `${process.env.LC_ALL ?? ''} ${process.env.LC_MESSAGES ?? ''} ${process.env.LANG ?? ''}`.toLowerCase();
  return locale.includes('de') ? 'de' : 'en';
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8');
    let settings: unknown;
    try {
      settings = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(`Could not parse sysdoctor settings: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      throw new Error('Sysdoctor settings must contain a JSON object');
    }
    const parsed = settings as Record<string, unknown>;
    const language = parsed.language;
    const mode = parsed.mode;
    if (language !== undefined && !isLanguage(language)) {
      throw new Error(`Unsupported language in sysdoctor settings: ${String(language)}`);
    }
    if (mode !== undefined && !isDisplayMode(mode)) {
      throw new Error(`Unsupported display mode in sysdoctor settings: ${String(mode)}`);
    }
    return {
      ...(language === undefined ? {} : { language }),
      ...(mode === undefined ? {} : { mode }),
    };
  } catch (error) {
    if (isMissingFile(error)) return {};
    throw error;
  }
}

export async function saveSettings(update: Settings): Promise<void> {
  const settings = { ...await loadSettings(), ...update };
  const path = settingsPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && languages.some((language) => language === value);
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === 'easy' || value === 'advanced';
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
