import { emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';
import { languageNames, languages, t, type Language } from './i18n.js';
import type { DisplayMode, Settings } from './settings.js';

const reset = '\u001b[0m';
const cyan = '\u001b[36m';
const yellow = '\u001b[33m';
const modes: DisplayMode[] = ['easy', 'advanced'];

export function chooseSetup(
  suggestedLanguage: Language,
  suggestedMode: DisplayMode,
  noColor: boolean,
): Promise<Required<Settings>> {
  return new Promise((resolve) => {
    let page: 'language' | 'mode' = 'language';
    let selectedLanguage = languages.indexOf(suggestedLanguage);
    let selectedMode = modes.indexOf(suggestedMode);
    let finished = false;
    const width = Math.max(50, Math.min(80, process.stdout.columns || 80));
    const inner = width - 2;
    const language = (): Language => languages[selectedLanguage]!;
    const paint = (value: string, color: string): string => noColor ? value : `${color}${value}${reset}`;

    const render = (): void => {
      const line = (value: string): string => `│${value.padEnd(inner).slice(0, inner)}│`;
      const languagePage = page === 'language';
      const options = languagePage
        ? languages.map((item, index) =>
            `  ${index === selectedLanguage ? '›' : ' '}  ${languageNames[item]}${item === suggestedLanguage ? `  (${t(language(), 'systemDefault')})` : ''}`)
        : modes.map((item, index) =>
            `  ${index === selectedMode ? '›' : ' '}  ${t(language(), item === 'easy' ? 'easyMode' : 'advancedMode')}`);
      const lines = [
        `┌${'─'.repeat(inner)}┐`,
        line(''),
        line(`  SYSDOCTOR  /  ${t(language(), 'setupTitle')}`),
        line(`  ${t(language(), languagePage ? 'setupLanguageStep' : 'setupModeStep')}`),
        line(''),
        ...options.map(line),
        line(''),
        ...(!languagePage
          ? [line(`  ${t(language(), 'easyModeDescription')}`), line(`  ${t(language(), 'advancedModeDescription')}`), line('')]
          : []),
        line(`  ${t(language(), 'setupNavigation')}`),
        line(''),
        `└${'─'.repeat(inner)}┘`,
      ];
      const selectedRow = languagePage ? 5 + selectedLanguage : 5 + selectedMode;
      process.stdout.write(`\u001b[H${lines.map((value, index) =>
        index === 2 ? paint(value, cyan) : index === selectedRow ? paint(value, yellow) : value).join('\n')}\u001b[J`);
    };

    const cleanup = (): void => {
      if (finished) return;
      finished = true;
      process.stdin.off('keypress', onKey);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      process.off('uncaughtException', onException);
      process.off('exit', onExit);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdout.write('\u001b[?25h\u001b[?1049l');
    };
    const onExit = (): void => {
      if (!finished) {
        finished = true;
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdout.write('\u001b[?25h\u001b[?1049l');
      }
    };
    const onKey = (_input: string, key: Key): void => {
      if (key.name === 'up' || key.name === 'k') {
        if (page === 'language') selectedLanguage = (selectedLanguage + languages.length - 1) % languages.length;
        else selectedMode = (selectedMode + modes.length - 1) % modes.length;
      } else if (key.name === 'down' || key.name === 'j') {
        if (page === 'language') selectedLanguage = (selectedLanguage + 1) % languages.length;
        else selectedMode = (selectedMode + 1) % modes.length;
      } else if (key.name === 'left' || key.name === 'backspace' || key.name === 'escape') {
        if (page === 'mode') page = 'language';
      } else if (key.name === 'return') {
        if (page === 'language') {
          page = 'mode';
        } else {
          const settings: Required<Settings> = {
            language: language(),
            mode: modes[selectedMode]!,
          };
          cleanup();
          resolve(settings);
          return;
        }
      } else if (key.ctrl && key.name === 'c') {
        onSignal();
        return;
      }
      render();
    };
    const onSignal = (): void => {
      cleanup();
      process.exit(130);
    };
    const onException = (error: Error): void => {
      cleanup();
      process.stderr.write(`sysdoctor: ${error.message}\n`, () => process.exit(1));
    };

    process.stdout.write('\u001b[?1049h\u001b[?25l');
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKey);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('uncaughtException', onException);
    process.on('exit', onExit);
    render();
  });
}
