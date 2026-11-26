import { emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';
import { languageNames, languages, localizeFinding, riskText, severityText, subsystemText, t } from './i18n.js';
import type { Language } from './i18n.js';
import type { DisplayMode } from './settings.js';
import type { Finding, Severity, SubsystemResult, SystemReport } from './types.js';

type Screen = 'overview' | 'details';
type Filter = 'all' | 'warn' | 'error';
type Modal = 'help' | 'detail' | 'language' | 'mode' | null;

interface TuiOptions {
  intervalMs: number;
  noColor: boolean;
  language: Language;
  mode: DisplayMode;
  refresh(): Promise<SystemReport>;
  exportReport(): Promise<string>;
  onLanguageChange(language: Language): Promise<void>;
  onModeChange(mode: DisplayMode): Promise<void>;
}

const colors: Record<Severity, string> = {
  ok: '\u001b[32m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
};
const reset = '\u001b[0m';
const reverse = '\u001b[7m';
const filters: Filter[] = ['all', 'warn', 'error'];
const modes: DisplayMode[] = ['easy', 'advanced'];

export function startTui(initialReport: SystemReport, options: TuiOptions): Promise<void> {
  return new Promise((resolve) => {
    let report = initialReport;
    let language = options.language;
    let mode = options.mode;
    let screen: Screen = 'overview';
    let subsystemIndex = 0;
    let findingIndex = 0;
    let evidenceIndex = 0;
    let filterIndex = 0;
    let languageIndex = languages.indexOf(language);
    let modeIndex = modes.indexOf(mode);
    let paused = false;
    let modal: Modal = null;
    let statusMessage = '';
    let stopped = false;
    let refreshBusy = false;
    let detailScroll = 0;
    let maxDetailScroll = 0;

    const msg = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>): string =>
      t(language, key, vars);
    const color = (severity: Severity, value: string): string =>
      options.noColor ? value : `${colors[severity]}${value}${reset}`;
    const selectedSubsystem = (): SubsystemResult =>
      report.results[Math.min(subsystemIndex, report.results.length - 1)]!;

    const visibleFindings = (subsystem: SubsystemResult): Finding[] => subsystem.findings.filter((finding) => {
      const filter = filters[filterIndex] ?? 'all';
      return filter === 'all' || (filter === 'error'
        ? finding.severity === 'error'
        : finding.severity === 'warn' || finding.severity === 'error');
    });

    const restore = (): void => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      process.stdout.off('resize', draw);
      process.stdin.off('keypress', onKey);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      process.off('uncaughtException', onException);
      process.off('exit', onExit);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\u001b[?25h\u001b[?1049l');
      resolve();
    };

    const onExit = (): void => {
      if (!stopped) {
        stopped = true;
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdout.write('\u001b[?25h\u001b[?1049l');
      }
    };
    const onSignal = (): void => restore();
    const onException = (error: Error): void => {
      restore();
      process.stderr.write(`sysdoctor: unexpected error: ${error.message}\n`, () => process.exit(1));
    };

    function draw(): void {
      if (stopped) return;
      const width = Math.max(40, process.stdout.columns || 80);
      const height = Math.max(12, process.stdout.rows || 24);
      const innerWidth = width - 2;
      const lines: string[] = [`┌${'─'.repeat(innerWidth)}┐`];
      const subsystem = selectedSubsystem();
      const findings = visibleFindings(subsystem);
      findingIndex = Math.min(findingIndex, Math.max(0, findings.length - 1));
      const selectedFinding = findings[findingIndex];
      const localized = selectedFinding ? localizeFinding(selectedFinding, language) : undefined;
      const health = overallSeverity(report.results);
      const when = new Date(report.generatedAt).toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US');
      const modeLabel = msg(mode === 'easy' ? 'easyMode' : 'advancedMode');
      const memUsed = report.system.memoryTotalBytes - report.system.memoryAvailableBytes;

      const row = (value: string, severity?: Severity, selected = false): void => {
        const plain = `│${padDisplay(value, innerWidth)}│`;
        const styled = selected ? `${reverse}${plain}${reset}` : severity ? color(severity, plain) : plain;
        lines.push(styled);
      };

      row(` ${msg('app')} v${report.version}  ·  ${report.hostname}  ·  ${report.distro} ${report.kernel}`);
      row(` ${msg('globalStatus')}: ${severityText(language, health)}  ·  ${paused ? msg('paused') : `${msg('live')} ${Math.ceil(options.intervalMs / 1000)}s`}  ·  ${msg('lastScan')}: ${when}  ·  ${msg('viewMode')}: ${modeLabel.toUpperCase()}`, health);

      if (screen === 'overview') {
        const attentionAreas = report.results.filter((item) => item.status === 'warn' || item.status === 'error').length;
        row('');
        row(` ${msg('overviewTitle')}`);
        row(` ${attentionAreas === 0
          ? msg('allClear')
          : attentionAreas === 1
            ? msg('attentionOne')
            : msg('attentionMany', { count: attentionAreas })}`, attentionAreas ? health : 'ok');
        row('');
        row(` ${msg('checks')}`);
        report.results.forEach((item, index) => {
          const count = item.findings.length;
          const summary = count === 0
            ? msg('healthy')
            : `${count} ${msg(count === 1 ? 'finding' : 'findingsPlural')}`;
          row(
            ` ${index === subsystemIndex ? '›' : ' '} ${statusSymbol(item.status)}  ${subsystemText(language, item.id).padEnd(18)} ${summary}`,
            item.status,
            index === subsystemIndex,
          );
        });
        row('');
        row(` ${msg('cpu')}: ${report.system.loadAverage[0].toFixed(2)} / ${report.system.cpuCount}  ·  ${msg('memory')}: ${Math.round(report.system.memoryUsedPercent)}% (${formatBytes(memUsed)} / ${formatBytes(report.system.memoryTotalBytes)})  ·  ${msg('uptime')}: ${formatUptime(report.system.uptimeSeconds)}`);
      } else {
        row('');
        row(` ${msg('backToOverview')}  ‹`);
        row(` ${msg('areaDetails')}: ${subsystemText(language, subsystem.id)}  ·  ${severityText(language, subsystem.status)}${filterIndex === 0 ? '' : `  ·  ${msg('filter')}: ${filterLabel(language, filters[filterIndex] ?? 'all')}`}`, subsystem.status);
        row(` ${msg('findings')}`);

        if (findings.length === 0) {
          row(` ${msg('noFindings')}`);
        } else {
          const maxListRows = Math.max(1, Math.min(5, Math.floor((height - 15) / 2)));
          const start = Math.max(0, Math.min(
            findingIndex - Math.floor(maxListRows / 2),
            Math.max(0, findings.length - maxListRows),
          ));
          for (let index = start; index < Math.min(findings.length, start + maxListRows); index += 1) {
            const finding = findings[index]!;
            const view = localizeFinding(finding, language);
            row(
              ` ${index === findingIndex ? '›' : ' '} ${severityText(language, view.severity)}  ${view.component} · ${view.title}`,
              view.severity,
              index === findingIndex,
            );
          }
          if (start + maxListRows < findings.length) {
            row(`   +${findings.length - start - maxListRows} ${msg('findingsPlural')}`);
          }
          row('');
          row(` ${localized?.title ?? ''}`, localized?.severity);
          const detailLines = buildDetails(localized, subsystem, evidenceIndex, language, Math.max(12, innerWidth - 2), mode);
          const available = Math.max(0, height - lines.length - 4);
          maxDetailScroll = Math.max(0, detailLines.length - available);
          detailScroll = Math.min(detailScroll, maxDetailScroll);
          const visibleDetails = detailLines.slice(detailScroll, detailScroll + available);
          for (const detailLine of visibleDetails) row(` ${detailLine}`, localized?.severity);
          if (maxDetailScroll > 0) {
            row(` ${detailScroll > 0 ? 'PgUp' : ''} ${detailScroll < maxDetailScroll ? 'PgDn' : ''} ${language === 'de' ? 'scrollen' : 'to scroll'}`);
          }
        }
      }

      const footers = screen === 'overview'
        ? [
            statusMessage || msg('chooseAreaHint'),
            `r ${msg('rescan')}   Space ${msg('pause')}   m ${msg('viewMode')}   L ${msg('languageKey')}   ? ${msg('helpKey')}   q ${msg('quit')}`,
          ]
        : [
            statusMessage || msg('chooseFindingHint'),
            `f ${msg('filterKey')}   [ / ] ${msg('evidence')}   e ${msg('export')}   m ${msg('viewMode')}   ? ${msg('helpKey')}   q ${msg('quit')}`,
          ];
      const maxBeforeFooter = Math.max(1, height - footers.length - 1);
      if (lines.length > maxBeforeFooter) lines.length = maxBeforeFooter;
      while (lines.length < maxBeforeFooter) lines.push(`│${' '.repeat(innerWidth)}│`);
      for (const footer of footers) row(` ${footer}`);
      lines.push(`└${'─'.repeat(innerWidth)}┘`);
      if (modal) {
        const modalContent = getModalContent(modal, localized, language, languageIndex, modeIndex);
        drawModal(lines, modalContent, width, height, options.noColor);
      }
      process.stdout.write(`\u001b[H${lines.slice(0, height).join('\n')}\u001b[J`);
    }

    async function refresh(): Promise<void> {
      if (refreshBusy || stopped) return;
      refreshBusy = true;
      statusMessage = msg('scanRunning');
      draw();
      try {
        report = await options.refresh();
        subsystemIndex = Math.min(subsystemIndex, report.results.length - 1);
        statusMessage = `${msg('scanFinished')} · ${new Date().toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US')}`;
      } catch (caught) {
        statusMessage = `${msg('scanFailed')}: ${caught instanceof Error ? caught.message : String(caught)}`;
      } finally {
        refreshBusy = false;
        draw();
      }
    }

    async function changeLanguage(nextLanguage: Language): Promise<void> {
      try {
        await options.onLanguageChange(nextLanguage);
        language = nextLanguage;
        languageIndex = languages.indexOf(nextLanguage);
        statusMessage = t(language, 'languageSaved');
      } catch (caught) {
        statusMessage = `${msg('scanFailed')}: ${caught instanceof Error ? caught.message : String(caught)}`;
      }
      draw();
    }

    async function changeMode(nextMode: DisplayMode): Promise<void> {
      try {
        await options.onModeChange(nextMode);
        mode = nextMode;
        modeIndex = modes.indexOf(nextMode);
        statusMessage = msg('modeSaved');
      } catch (caught) {
        statusMessage = `${msg('scanFailed')}: ${caught instanceof Error ? caught.message : String(caught)}`;
      }
      draw();
    }

    function onKey(input: string, key: Key): void {
      if (stopped) return;
      statusMessage = '';
      const character = typeof input === 'string' ? input.toLowerCase() : '';
      if ((key.ctrl && key.name === 'c') || (key.name === 'q' && modal === null)) {
        restore();
        return;
      }
      if (modal === 'language') {
        if (key.name === 'up' || key.name === 'k') languageIndex = (languageIndex + languages.length - 1) % languages.length;
        else if (key.name === 'down' || key.name === 'j') languageIndex = (languageIndex + 1) % languages.length;
        else if (key.name === 'return') {
          modal = null;
          void changeLanguage(languages[languageIndex]!);
        } else if (key.name === 'escape' || key.name === 'q') modal = null;
        draw();
        return;
      }
      if (modal === 'mode') {
        if (key.name === 'up' || key.name === 'k' || key.name === 'down' || key.name === 'j') modeIndex = (modeIndex + 1) % modes.length;
        else if (key.name === 'return') {
          modal = null;
          void changeMode(modes[modeIndex]!);
        } else if (key.name === 'escape' || key.name === 'q') modal = null;
        draw();
        return;
      }
      if (modal) {
        if (key.name === 'escape' || key.name === 'return' || key.name === 'q') modal = null;
        draw();
        return;
      }
      if (character === 'r') {
        void refresh();
      } else if (key.name === 'space') {
        paused = !paused;
        if (!paused) void refresh();
      } else if (character === 'e') {
        void options.exportReport().then((path) => {
          statusMessage = `${msg('exportComplete')}: ${path}`;
          draw();
        }).catch((error: unknown) => {
          statusMessage = `${msg('exportFailed')}: ${String(error)}`;
          draw();
        });
      } else if (character === 'm') {
        modeIndex = modes.indexOf(mode);
        modal = 'mode';
      } else if (character === 'l') {
        languageIndex = languages.indexOf(language);
        modal = 'language';
      } else if (input === '?' || character === 'h') {
        modal = 'help';
      } else if (screen === 'overview') {
        if (key.name === 'up' || key.name === 'k') subsystemIndex = Math.max(0, subsystemIndex - 1);
        else if (key.name === 'down' || key.name === 'j') subsystemIndex = Math.min(report.results.length - 1, subsystemIndex + 1);
        else if (key.name === 'return') {
          screen = 'details';
          findingIndex = 0;
          detailScroll = 0;
        }
      } else if (key.name === 'escape' || key.name === 'backspace') {
        screen = 'overview';
      } else if (key.name === 'up' || key.name === 'k') {
        findingIndex = Math.max(0, findingIndex - 1);
        detailScroll = 0;
      } else if (key.name === 'down' || key.name === 'j') {
        const findingCount = visibleFindings(selectedSubsystem()).length;
        if (findingCount > 0) findingIndex = Math.min(findingCount - 1, findingIndex + 1);
        detailScroll = 0;
      } else if (key.name === 'return') {
        modal = 'detail';
      } else if (key.name === 'pageup') {
        detailScroll = Math.max(0, detailScroll - 5);
      } else if (key.name === 'pagedown') {
        detailScroll = Math.min(maxDetailScroll, detailScroll + 5);
      } else if (input === '[' || input === ']') {
        const evidenceCount = selectedSubsystem().evidence.length;
        if (evidenceCount > 0) {
          evidenceIndex = (evidenceIndex + (input === ']' ? 1 : evidenceCount - 1)) % evidenceCount;
        }
      } else if (character === 'f') {
        filterIndex = (filterIndex + 1) % filters.length;
        findingIndex = 0;
        detailScroll = 0;
      }
      draw();
    }

    process.stdout.write('\u001b[?1049h\u001b[?25l');
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKey);
    process.stdout.on('resize', draw);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('uncaughtException', onException);
    process.on('exit', onExit);
    const timer = setInterval(() => {
      if (!paused) void refresh();
    }, options.intervalMs);
    draw();
  });
}

function getModalContent(
  modal: Exclude<Modal, null>,
  selectedFinding: Finding | undefined,
  language: Language,
  selectedLanguage: number,
  selectedMode: number,
): string[] {
  if (modal === 'help') {
    return [
      t(language, 'help'),
      t(language, 'chooseAreaHint'),
      t(language, 'chooseFindingHint'),
      `r ${t(language, 'rescan')}   Space ${t(language, 'pause')}   e ${t(language, 'export')}`,
      `f ${t(language, 'filterKey')}   m ${t(language, 'viewMode')}   L ${t(language, 'languageKey')}`,
      `? ${t(language, 'helpKey')}   q ${t(language, 'quit')}   Esc ${language === 'de' ? 'zurück' : 'close'}`,
    ];
  }
  if (modal === 'language') {
    return [
      t(language, 'chooseLanguage'),
      ...languages.map((item, index) => `${index === selectedLanguage ? '›' : ' '} ${languageNames[item]}`),
      t(language, 'languagePrompt'),
    ];
  }
  if (modal === 'mode') {
    return [
      t(language, 'modePrompt'),
      `${selectedMode === 0 ? '›' : ' '} ${t(language, 'easyMode')}`,
      `  ${t(language, 'easyModeDescription')}`,
      `${selectedMode === 1 ? '›' : ' '} ${t(language, 'advancedMode')}`,
      `  ${t(language, 'advancedModeDescription')}`,
      language === 'de' ? '↑/↓ wählen   Enter speichern   Esc abbrechen' : '↑/↓ select   Enter save   Esc cancel',
    ];
  }
  if (!selectedFinding) return [t(language, 'noFindings')];
  return [
    t(language, 'details'),
    `${severityText(language, selectedFinding.severity)} · ${selectedFinding.component} · ${selectedFinding.title}`,
    ...buildDetails(selectedFinding, undefined, 0, language, 82, 'advanced'),
    language === 'de' ? 'Esc / Enter schließen' : 'Esc / Enter close',
  ];
}

function drawModal(lines: string[], content: string[], width: number, height: number, noColor: boolean): void {
  const dialogWidth = Math.min(Math.max(32, width - 8), 90);
  const maxContent = Math.max(1, height - 6);
  const visibleContent = content.slice(0, maxContent);
  const x = Math.max(0, Math.floor((width - dialogWidth) / 2));
  const first = Math.max(0, Math.floor((height - visibleContent.length - 2) / 2));
  const top = `╭${'─'.repeat(dialogWidth - 2)}╮`;
  const bottom = `╰${'─'.repeat(dialogWidth - 2)}╯`;
  const dialogRows = [top, ...visibleContent.map((line) => `│ ${padDisplay(line, dialogWidth - 4)} │`), bottom];
  for (let index = 0; index < dialogRows.length && first + index < lines.length; index += 1) {
    const leftPad = ' '.repeat(x);
    const line = padDisplay(dialogRows[index] ?? '', dialogWidth);
    lines[first + index] = noColor ? `${leftPad}${line}` : `${leftPad}\u001b[46m\u001b[30m${line}${reset}`;
  }
}

function buildDetails(
  finding: Finding | undefined,
  subsystem: SubsystemResult | undefined,
  evidenceIndex: number,
  language: Language,
  width: number,
  mode: DisplayMode,
): string[] {
  if (!finding) return [t(language, 'noFindings')];
  const lines = [
    `${t(language, 'cause')}:`,
    ...wrapText(finding.cause, width),
  ];
  if (finding.steps.length > 0) {
    lines.push(`${mode === 'easy' ? t(language, 'nextAction') : t(language, 'steps')}:`);
    const steps = mode === 'easy' ? finding.steps.slice(0, 1) : finding.steps;
    for (const step of steps) {
      lines.push(...wrapText(mode === 'easy' ? step.text : `[${riskText(language, step.risk)}] ${step.text}`, width));
    }
  }
  if (mode === 'easy') {
    lines.push(t(language, 'detailHint'));
    return lines;
  }
  if (subsystem) {
    const evidence = subsystem.evidence[evidenceIndex % Math.max(1, subsystem.evidence.length)];
    if (evidence) {
      lines.push(`${t(language, 'technicalEvidence')} · ${t(language, 'command')}: ${evidence.source}`);
      lines.push(...wrapText(evidence.output, width));
    } else if (finding.evidence.length > 0) {
      lines.push(`${t(language, 'evidence')}:`);
      lines.push(...wrapText(finding.evidence.join(' · '), width));
    } else {
      lines.push(t(language, 'noEvidence'));
    }
    if (subsystem.evidence.length > 1) lines.push(t(language, 'evidenceHint'));
  } else {
    lines.push(`${t(language, 'evidence')}:`);
    lines.push(...wrapText(finding.evidence.join(' · ') || t(language, 'noEvidence'), width));
  }
  return lines;
}

function overallSeverity(results: SubsystemResult[]): Severity {
  const priority: Record<Severity, number> = { ok: 0, info: 1, warn: 2, error: 3 };
  return results.reduce<Severity>((best, item) =>
    priority[item.status] > priority[best] ? item.status : best, 'ok');
}

function filterLabel(language: Language, filter: Filter): string {
  return filter === 'all' ? t(language, 'all') : filter === 'warn'
    ? t(language, 'warnError') : t(language, 'errorsOnly');
}

function statusSymbol(status: Severity): string {
  return status === 'error' ? '✖' : status === 'warn' ? '▲' : status === 'info' ? '◆' : '●';
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = Math.max(0, bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

function wrapText(value: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (displayWidth(`${line} ${word}`) <= width) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
      while (displayWidth(line) > width) {
        const [part, rest] = splitDisplay(line, width);
        lines.push(part);
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

function padDisplay(value: string, width: number): string {
  const [clipped] = splitDisplay(value, Math.max(0, width - 1));
  const result = displayWidth(value) > width ? `${clipped}…` : value;
  return `${result}${' '.repeat(Math.max(0, width - displayWidth(result)))}`;
}

function splitDisplay(value: string, width: number): [string, string] {
  let visible = 0;
  let index = 0;
  for (const character of value) {
    const charWidth = displayWidth(character);
    if (visible + charWidth > width) break;
    visible += charWidth;
    index += character.length;
  }
  return [value.slice(0, index), value.slice(index)];
}

function displayWidth(value: string): number {
  return Array.from(value).reduce((total, character) => total + (isWideCharacter(character) ? 2 : 1), 0);
}

function isWideCharacter(character: string): boolean {
  const point = character.codePointAt(0) ?? 0;
  return (point >= 0x1100 && point <= 0x115f)
    || (point >= 0x2e80 && point <= 0xa4cf)
    || (point >= 0xac00 && point <= 0xd7a3)
    || (point >= 0xf900 && point <= 0xfaff)
    || (point >= 0xfe10 && point <= 0xfe6f)
    || (point >= 0xff00 && point <= 0xff60)
    || (point >= 0x1f300 && point <= 0x1faff);
}
