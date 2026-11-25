import { emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';
import { languageNames, languages, localizeFinding, riskText, severityText, subsystemText, t } from './i18n.js';
import type { Language } from './i18n.js';
import type { Finding, Severity, SubsystemResult, SystemReport } from './types.js';

type Focus = 0 | 1 | 2;
type Filter = 'all' | 'warn' | 'error';
type Modal = 'help' | 'detail' | 'language' | null;

interface TuiOptions {
  intervalMs: number;
  noColor: boolean;
  language: Language;
  refresh(): Promise<SystemReport>;
  exportReport(): Promise<string>;
  onLanguageChange(language: Language): Promise<void>;
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
const sparkChars = '▁▂▃▄▅▆▇█';

export function startTui(initialReport: SystemReport, options: TuiOptions): Promise<void> {
  return new Promise((resolve) => {
    let report = initialReport;
    let language = options.language;
    let focus: Focus = 0;
    let subsystemIndex = 0;
    let findingIndex = 0;
    let evidenceIndex = 0;
    let filterIndex = 0;
    let languageIndex = languages.indexOf(language);
    let paused = false;
    let modal: Modal = null;
    let statusMessage = '';
    let stopped = false;
    let refreshBusy = false;
    const loadHistory: number[] = [];
    const memoryHistory: number[] = [];

    recordHistory(report);

    const msg = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>): string =>
      t(language, key, vars);
    const color = (severity: Severity, value: string): string =>
      options.noColor ? value : `${colors[severity]}${value}${reset}`;
    const selectedSubsystem = (): SubsystemResult =>
      report.results[Math.min(subsystemIndex, report.results.length - 1)]!;

    const visibleFindings = (subsystem: SubsystemResult): Finding[] => subsystem.findings.filter((item) => {
      const filter = filters[filterIndex] ?? 'all';
      return filter === 'all' || (filter === 'error'
        ? item.severity === 'error'
        : item.severity === 'warn' || item.severity === 'error');
    });

    function recordHistory(snapshot: SystemReport): void {
      loadHistory.push(Math.min(100, snapshot.system.loadAverage[0] / Math.max(1, snapshot.system.cpuCount) * 100));
      memoryHistory.push(snapshot.system.memoryUsedPercent);
      if (loadHistory.length > 30) loadHistory.shift();
      if (memoryHistory.length > 30) memoryHistory.shift();
    }

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
      const compact = width < 100 || height < 30;
      const innerWidth = width - 2;
      const leftWidth = compact ? innerWidth : Math.max(25, Math.min(34, Math.floor(innerWidth * 0.27)));
      const rightWidth = compact ? innerWidth : innerWidth - leftWidth - 1;
      const subsystem = selectedSubsystem();
      const findings = visibleFindings(subsystem);
      findingIndex = Math.min(findingIndex, Math.max(0, findings.length - 1));
      const selectedFinding = findings[findingIndex];
      const localized = selectedFinding ? localizeFinding(selectedFinding, language) : undefined;
      const lines: string[] = [];
      const top = `┌${'─'.repeat(innerWidth)}┐`;
      const bottom = `└${'─'.repeat(innerWidth)}┘`;
      const clip = (value: string, maxWidth: number): string => padDisplay(value, maxWidth);
      const row = (value: string, severity?: Severity, isSelected = false): void => {
        const plain = `│${clip(value, innerWidth)}│`;
        lines.push(style(plain, severity, isSelected));
      };
      const splitRow = (
        left: string,
        right: string,
        leftSeverity?: Severity,
        rightSeverity?: Severity,
        leftSelected = false,
        rightSelected = false,
      ): void => {
        if (compact) {
          row(left || right, leftSeverity ?? rightSeverity, leftSelected || rightSelected);
          return;
        }
        const leftCell = clip(left, leftWidth);
        const rightCell = clip(right, rightWidth);
        const plain = `│${leftCell}│${rightCell}│`;
        const chosen = leftSelected || rightSelected;
        if (options.noColor) {
          lines.push(chosen ? `${reverse}${plain}${reset}` : plain);
        } else if (chosen) {
          lines.push(`${reverse}${plain}${reset}`);
        } else {
          const severity = rightSeverity ?? leftSeverity;
          lines.push(severity ? color(severity, plain) : plain);
        }
      };
      const health = overallSeverity(report.results);
      const when = new Date(report.generatedAt).toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US');
      const statusText = paused ? msg('paused') : msg('live');
      const memPercent = report.system.memoryUsedPercent;
      const loadPercent = Math.min(100,
        report.system.loadAverage[0] / Math.max(1, report.system.cpuCount) * 100);
      const memUsed = report.system.memoryTotalBytes - report.system.memoryAvailableBytes;
      const hostSummary = `${report.hostname} · ${report.distro} · ${report.kernel}`;
      const leftPanel: Array<{ text: string; severity?: Severity; selected?: boolean }> =
        report.results.flatMap((item, index) => {
        const alerts = item.findings.filter((finding) =>
          finding.severity === 'warn' || finding.severity === 'error').length;
        return [
          {
            text: `${index === subsystemIndex ? '›' : ' '} ${statusSymbol(item.status)} ${subsystemText(language, item.id)}  ${alerts} !`,
            severity: item.status,
            selected: index === subsystemIndex,
          },
          {
            text: `    ${item.metrics.join(' · ') || t(language, 'healthy')}`,
          },
        ];
        });
      leftPanel.push(
        { text: `${msg('cpu')}: ${report.system.loadAverage.map((value) => value.toFixed(2)).join(' / ')}` },
        { text: resourceLine(msg('memory'), memPercent, memoryHistory), severity: memPercent > 95 ? 'error' : memPercent > 85 ? 'warn' : 'ok' },
        { text: `${msg('uptime')}: ${formatUptime(report.system.uptimeSeconds)}` },
      );
      const stats = [
        `${msg('health')}: ${severityText(language, health)}`,
        `${msg('cpu')}: ${report.system.loadAverage[0].toFixed(2)} / ${report.system.cpuCount} ${spark(loadHistory)}`,
        `${msg('memory')}: ${formatBytes(memUsed)} / ${formatBytes(report.system.memoryTotalBytes)} ${spark(memoryHistory)}`,
      ].join('   ');
      lines.push(top);
      row(` ${msg('app')} v${report.version}   ${hostSummary}   ${statusText} ${Math.ceil(options.intervalMs / 1000)}s   ${msg('lastScan')} ${when}`);
      row(stats, health);
      splitRow(
        ` ${msg('subsystemPanel')}  ${report.results.length}${focus === 0 ? ' ◀' : ''}`,
        ` ${msg('findings')} · ${subsystemText(language, subsystem.id)} (${findings.length})   ${msg('filter')}: ${filterLabel(language, filters[filterIndex] ?? 'all')}`,
        undefined,
        undefined,
        focus === 0,
        focus === 1,
      );

      const contentRows = Math.max(4, height - 6);
      if (compact) {
        renderCompact({
          contentRows,
          focus,
          report,
          subsystem,
          findings,
          selectedFinding: localized,
          subsystemIndex,
          evidenceIndex,
          language,
          row,
          selectedFindingIndex: findingIndex,
          loadPercent,
          memPercent,
          loadHistory,
          memoryHistory,
        });
      } else {
        const topRows = Math.max(6, Math.floor(contentRows * 0.56));
        const evidenceLines = buildInspector(localized, subsystem, evidenceIndex, language, rightWidth);
        const visibleCount = Math.max(1, Math.floor(topRows / 3));
        const startFinding = Math.max(0, Math.min(
          findingIndex - Math.floor(visibleCount / 2),
          Math.max(0, findings.length - visibleCount),
        ));
        for (let index = 0; index < contentRows; index += 1) {
          if (index < topRows) {
            const relative = Math.floor(index / 3);
            const findingAt = startFinding + relative;
            const item = findings[findingAt];
            const lineInFinding = index % 3;
            const leftItem = leftPanel[index] ?? { text: '' };
            if (item) {
              const view = localizeFinding(item, language);
              const selected = findingAt === findingIndex;
              if (lineInFinding === 0) {
                splitRow(
                  leftItem.text,
                  `${severityText(language, view.severity)}  ${view.component} · ${view.title}`,
                  leftItem.severity,
                  view.severity,
                  leftItem.selected,
                  selected,
                );
              } else if (lineInFinding === 1) {
                splitRow(
                  leftItem.text,
                  `↳ ${view.cause}`,
                  leftItem.severity,
                  view.severity,
                  leftItem.selected,
                );
              } else {
                const step = view.steps[0];
                splitRow(
                  leftItem.text,
                  step ? `→ [${riskText(language, step.risk)}] ${step.text}` : `✓ ${msg('noAction')}`,
                  leftItem.severity,
                  step?.risk === 'caution' ? 'warn' : undefined,
                  leftItem.selected,
                );
              }
            } else {
              splitRow(
                leftItem.text,
                lineInFinding === 0 && findings.length === 0
                  ? msg('noFindings')
                  : '',
                leftItem.severity,
                undefined,
                leftItem.selected,
              );
            }
          } else if (index === topRows) {
            splitRow(
              leftPanel[index]?.text ?? '',
              '─'.repeat(rightWidth),
              leftPanel[index]?.severity,
            );
          } else {
            const detailLine = evidenceLines[index - topRows - 1] ?? '';
            const leftItem = leftPanel[index] ?? { text: '' };
            splitRow(leftItem.text, detailLine, leftItem.severity, localized?.severity, leftItem.selected);
          }
        }
      }

      const footer = statusMessage || [
        `${msg('focus')}: ${focusLabel(language, focus)}`,
        `↑/↓ ${language === 'de' ? 'Navigieren' : 'Navigate'}`,
        `Enter ${msg('open')}`,
        `r ${msg('rescan')}`,
        `Space ${msg('pause')}`,
        `e ${msg('export')}`,
        `f ${msg('filterKey')}`,
        `L ${msg('languageKey')}`,
        `? ${msg('helpKey')}`,
        `q ${msg('quit')}`,
      ].join('   ');
      row(` ${footer} `, statusMessage ? 'info' : undefined);
      lines.push(bottom);
      if (modal) drawModal(lines, modal, localized, language, languageIndex, width, height, options.noColor);
      process.stdout.write(`\u001b[H${lines.slice(0, height).join('\n')}\u001b[J`);

      function style(line: string, severity?: Severity, isSelected = false): string {
        if (options.noColor) return isSelected ? `${reverse}${line}${reset}` : line;
        const painted = severity ? color(severity, line) : line;
        return isSelected ? `${reverse}${painted}${reset}` : painted;
      }
    }

    function renderCompact(args: {
      contentRows: number;
      focus: Focus;
      report: SystemReport;
      subsystem: SubsystemResult;
      findings: Finding[];
      selectedFinding: Finding | undefined;
      subsystemIndex: number;
      evidenceIndex: number;
      language: Language;
      row(value: string, severity?: Severity, isSelected?: boolean): void;
      selectedFindingIndex: number;
      loadPercent: number;
      memPercent: number;
      loadHistory: number[];
      memoryHistory: number[];
    }): void {
      const {
        contentRows, focus, report: currentReport, subsystem, findings, selectedFinding,
        subsystemIndex: selectedSubsystemIndex, evidenceIndex: currentEvidenceIndex,
        language: currentLanguage, row: addRow, selectedFindingIndex,
        loadPercent: currentLoadPercent, memPercent: currentMemPercent,
        loadHistory: currentLoadHistory, memoryHistory: currentMemoryHistory,
      } = args;
      let content: Array<{ text: string; severity?: Severity; selected?: boolean }> = [];
      if (focus === 0) {
        content = currentReport.results.map((item, index) => ({
          text: `${index === selectedSubsystemIndex ? '›' : ' '} ${statusSymbol(item.status)} ${subsystemText(currentLanguage, item.id)}  ${item.findings.length} ${t(currentLanguage, 'findings').toLowerCase()}`,
          severity: item.status,
          selected: index === selectedSubsystemIndex,
        }));
        content.push({ text: resourceLine(t(currentLanguage, 'cpu'), currentLoadPercent, currentLoadHistory) });
        content.push({ text: resourceLine(t(currentLanguage, 'memory'), currentMemPercent, currentMemoryHistory) });
      } else if (focus === 1) {
        content = findings.flatMap((item, index) => {
          const view = localizeFinding(item, currentLanguage);
          return [
            { text: `${severityText(currentLanguage, view.severity)} · ${view.title}`, severity: view.severity, selected: index === selectedFindingIndex },
            { text: `  ${view.cause}`, severity: view.severity, selected: index === selectedFindingIndex },
          ];
        });
      } else {
        content = buildInspector(selectedFinding, subsystem, currentEvidenceIndex, currentLanguage, process.stdout.columns || 80)
          .map((text) => ({ text, ...(selectedFinding ? { severity: selectedFinding.severity } : {}) }));
      }
      if (content.length === 0) content = [{ text: t(currentLanguage, 'noFindings') }];
      const visibleContent = content.slice(0, contentRows);
      for (let index = 0; index < contentRows; index += 1) {
        const item = visibleContent[index];
        addRow(item ? item.text : '', item?.severity, item?.selected);
      }
    }

    async function refresh(): Promise<void> {
      if (refreshBusy || stopped) return;
      refreshBusy = true;
      statusMessage = msg('scanRunning');
      draw();
      try {
        report = await options.refresh();
        recordHistory(report);
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
        statusMessage = msg('languageSaved');
      } catch (caught) {
        statusMessage = `${msg('scanFailed')}: ${caught instanceof Error ? caught.message : String(caught)}`;
      }
    }

    function onKey(input: string, key: Key): void {
      if (stopped) return;
      statusMessage = '';
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
      if (modal) {
        if (key.name === 'escape' || key.name === 'return' || key.name === 'q') modal = null;
        draw();
        return;
      }
      if (key.name === 'tab') {
        focus = ((focus + (key.shift ? 2 : 1)) % 3) as Focus;
      } else if (key.name === 'up' || key.name === 'k') {
        if (focus === 0) subsystemIndex = Math.max(0, subsystemIndex - 1);
        else if (focus === 1) findingIndex = Math.max(0, findingIndex - 1);
        else evidenceIndex = Math.max(0, evidenceIndex - 1);
      } else if (key.name === 'down' || key.name === 'j') {
        if (focus === 0) subsystemIndex = Math.min(report.results.length - 1, subsystemIndex + 1);
        else if (focus === 1) findingIndex += 1;
        else evidenceIndex += 1;
      } else if (key.name === 'return') {
        modal = 'detail';
      } else if (key.name === 'space') {
        paused = !paused;
        if (!paused) void refresh();
      } else if (input.toLowerCase() === 'r') {
        void refresh();
      } else if (input.toLowerCase() === 'e') {
        void options.exportReport().then((path) => {
          statusMessage = `${msg('exportComplete')}: ${path}`;
          draw();
        }).catch((error: unknown) => {
          statusMessage = `${msg('exportFailed')}: ${String(error)}`;
          draw();
        });
      } else if (input.toLowerCase() === 'f') {
        filterIndex = (filterIndex + 1) % filters.length;
        findingIndex = 0;
      } else if (input.toLowerCase() === 'l') {
        modal = 'language';
      } else if (input === '?' || input.toLowerCase() === 'h') {
        modal = 'help';
      }
      draw();
    }

    process.stdout.write('\u001b[?1049h\u001b[?25l');
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
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

function drawModal(
  lines: string[],
  modal: Exclude<Modal, null>,
  selectedFinding: Finding | undefined,
  language: Language,
  selectedLanguage: number,
  width: number,
  height: number,
  noColor: boolean,
): void {
  const content = modal === 'help'
    ? [
        t(language, 'help'),
        '↑/↓ j/k  navigate   Tab/Shift+Tab  focus',
        `Enter  ${t(language, 'open')}    r  ${t(language, 'rescan')}    Space  ${t(language, 'pause')}`,
        `e  ${t(language, 'export')}    f  ${t(language, 'filterKey')}    L  ${t(language, 'languageKey')}`,
        `q  ${t(language, 'quit')}    Esc  close`,
      ]
    : modal === 'language'
      ? [
          t(language, 'chooseLanguage'),
          ...languages.map((item, index) => `${index === selectedLanguage ? '›' : ' '} ${languageNames[item]}`),
          t(language, 'languagePrompt'),
        ]
      : selectedFinding
        ? [
            t(language, 'details'),
            `${severityText(language, selectedFinding.severity)} · ${selectedFinding.component} · ${selectedFinding.title}`,
            `${t(language, 'cause')}: ${selectedFinding.cause}`,
            `${t(language, 'steps')}: ${selectedFinding.steps.map((step) => `[${riskText(language, step.risk)}] ${step.text}`).join('  ') || t(language, 'noAction')}`,
            `${t(language, 'evidence')}: ${selectedFinding.evidence.join(' · ') || t(language, 'noEvidence')}`,
            'Esc / Enter  close',
          ]
        : [t(language, 'noFindings'), 'Esc / Enter  close'];
  const dialogWidth = Math.min(Math.max(32, width - 8), 90);
  const x = Math.max(0, Math.floor((width - dialogWidth) / 2));
  const first = Math.max(0, Math.floor((height - content.length - 2) / 2));
  const top = `╭${'─'.repeat(dialogWidth - 2)}╮`;
  const bottom = `╰${'─'.repeat(dialogWidth - 2)}╯`;
  const dialogRows = [top, ...content.map((line) => `│ ${padDisplay(line, dialogWidth - 4)} │`), bottom];
  for (let index = 0; index < dialogRows.length && first + index < lines.length; index += 1) {
    const leftPad = ' '.repeat(x);
    const row = padDisplay(dialogRows[index] ?? '', dialogWidth);
    lines[first + index] = noColor ? `${leftPad}${row}` : `${leftPad}\u001b[46m\u001b[30m${row}${reset}`;
  }
}

function buildInspector(
  finding: Finding | undefined,
  subsystem: SubsystemResult,
  evidenceIndex: number,
  language: Language,
  width: number,
): string[] {
  if (!finding) return [t(language, 'noFindings')];
  const lines: string[] = [];
  lines.push(`${t(language, 'cause')}:`);
  lines.push(...wrapText(finding.cause, width));
  if (finding.steps.length) {
    lines.push(`${t(language, 'steps')}:`);
    for (const step of finding.steps) {
      lines.push(...wrapText(`[${riskText(language, step.risk)}] ${step.text}`, width));
    }
  }
  const evidence = subsystem.evidence[evidenceIndex % Math.max(1, subsystem.evidence.length)];
  if (evidence) {
    lines.push(`${t(language, 'command')}: ${evidence.source}`);
    lines.push(`${t(language, 'evidence')}:`);
    lines.push(...wrapText(evidence.output, width));
  } else if (finding.evidence.length) {
    lines.push(`${t(language, 'evidence')}:`);
    lines.push(...wrapText(finding.evidence[evidenceIndex % finding.evidence.length] ?? '', width));
  } else {
    lines.push(t(language, 'noEvidence'));
  }
  return lines;
}

function renderSubsystemLine(
  item: SubsystemResult,
  index: number,
  selectedIndex: number,
  language: Language,
): string {
  const count = item.findings.filter((finding) =>
    finding.severity === 'warn' || finding.severity === 'error').length;
  return `${index === selectedIndex ? '›' : ' '} ${statusSymbol(item.status)} ${subsystemText(language, item.id)}  ${count} !`;
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

function focusLabel(language: Language, focus: Focus): string {
  const key = focus === 0 ? 'subsystemFocus' : focus === 1 ? 'findingFocus' : 'inspectorFocus';
  return t(language, key);
}

function statusSymbol(status: Severity): string {
  return status === 'error' ? '✖' : status === 'warn' ? '▲' : status === 'info' ? '◆' : '●';
}

function bar(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round(clamped / 100 * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

function resourceLine(label: string, percent: number, history: number[]): string {
  return `${label.padEnd(12)} ${bar(percent, 10)} ${Math.round(percent).toString().padStart(3)}% ${spark(history)}`;
}

function spark(values: number[]): string {
  if (values.length === 0) return '';
  return values.map((value) => sparkChars[Math.min(
    sparkChars.length - 1,
    Math.floor(Math.max(0, Math.min(100, value)) / 100 * sparkChars.length),
  )]).join('');
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
