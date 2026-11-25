import { emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';
import { languageNames, languages, type Language } from './i18n.js';

const reset = '\u001b[0m';
const cyan = '\u001b[36m';
const yellow = '\u001b[33m';

export function chooseLanguage(suggested: Language, noColor: boolean): Promise<Language> {
  return new Promise((resolve) => {
    let selected = languages.indexOf(suggested);
    let finished = false;
    const width = Math.max(50, Math.min(80, process.stdout.columns || 80));
    const inner = width - 2;
    const paint = (value: string, color: string): string => noColor ? value : `${color}${value}${reset}`;

    const render = (): void => {
      const line = (value: string): string => `│${value.padEnd(inner).slice(0, inner)}│`;
      const lines = [
        `┌${'─'.repeat(inner)}┐`,
        line(''),
        line('  SYSDOCTOR  /  FIRST-RUN SETUP'),
        line('  Choose your language / Sprache auswählen'),
        line(''),
        ...languages.map((language, index) =>
          line(`  ${index === selected ? '›' : ' '}  ${languageNames[language]}${language === suggested ? '  (system default)' : ''}`)),
        line(''),
        line('  ↑ / ↓  select      ENTER  continue'),
        line(''),
        `└${'─'.repeat(inner)}┘`,
      ];
      process.stdout.write(`\u001b[H${lines.map((value, index) =>
        index === 2 ? paint(value, cyan) : index === 5 + selected ? paint(value, yellow) : value).join('\n')}\u001b[J`);
    };

    const cleanup = (): void => {
      if (finished) return;
      finished = true;
      process.stdin.off('keypress', onKey);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      process.off('uncaughtException', onException);
      process.off('exit', onExit);
      process.stdin.setRawMode(false);
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
      if (key.name === 'up' || key.name === 'k') selected = (selected + languages.length - 1) % languages.length;
      else if (key.name === 'down' || key.name === 'j') selected = (selected + 1) % languages.length;
      else if (key.name === 'return') {
        const language = languages[selected]!;
        cleanup();
        resolve(language);
        return;
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
    process.stdin.setRawMode(true);
    emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKey);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('uncaughtException', onException);
    process.on('exit', onExit);
    render();
  });
}
