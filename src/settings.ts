import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { languages, type Language } from './i18n.js';

interface Settings {
  language?: Language;
}

function settingsPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(configHome, 'sysdoctor', 'settings.json');
}

export function detectLanguage(): Language {
  const locale = `${process.env.LC_ALL ?? ''} ${process.env.LC_MESSAGES ?? ''} ${process.env.LANG ?? ''}`.toLowerCase();
  return locale.includes('de') ? 'de' : 'en';
}

export async function loadLanguage(): Promise<Language | null> {
  try {
    const raw = await readFile(settingsPath(), 'utf8');
    let settings: Settings;
    try {
      settings = JSON.parse(raw) as Settings;
    } catch (error) {
      throw new Error(`Could not parse sysdoctor settings: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (settings.language === undefined) return null;
    if (!languages.includes(settings.language)) {
      throw new Error(`Unsupported language in sysdoctor settings: ${String(settings.language)}`);
    }
    return settings.language;
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function saveLanguage(language: Language): Promise<void> {
  const path = settingsPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ language }, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
