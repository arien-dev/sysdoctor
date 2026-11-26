#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectReport, anonymizeReport, reportToJson, reportToMarkdown, VERSION } from './report.js';
import { startTui } from './tui.js';
import { chooseSetup } from './setup.js';
import { detectLanguage, loadSettings, saveSettings } from './settings.js';
import { localizeFinding, riskText, severityText, subsystemText, t } from './i18n.js';
import type { Language } from './i18n.js';
import type { DisplayMode } from './settings.js';
import type { Severity, SystemReport } from './types.js';

interface Options {
  noTui: boolean;
  json: boolean;
  redact: boolean;
  noColor: boolean;
  intervalMs: number;
  timeoutMs: number;
  language: Language | null;
  command: 'scan' | 'report' | 'help' | 'version';
}

const help = `sysdoctor - Linux system diagnostics

Usage:
  sysdoctor [--no-tui] [--json] [--redact] [--interval <ms>] [--timeout <ms>] [--no-color]
  sysdoctor report [--redact]

Options:
  --no-tui       Print a concise diagnostic summary
  --json         Print the complete report as JSON
  --redact       Anonymize personal identifiers in output
  --interval ms  Automatic TUI refresh interval (default: 2000)
  --timeout ms   Timeout for each system command (default: 3000)
  --lang code    Use German (de) or English (en)
  --no-color     Disable terminal colors
  --help         Show this help
  --version      Show version
`;

function parseArgs(args: string[]): Options {
  const options: Options = {
    noTui: false,
    json: false,
    redact: false,
    noColor: false,
    intervalMs: 2000,
    timeoutMs: 3000,
    language: null,
    command: 'scan',
  };
  let index = 0;
  if (args[0] === 'report') {
    options.command = 'report';
    index = 1;
  }
  while (index < args.length) {
    const arg = args[index]!;
    if (arg === '--no-tui') options.noTui = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--redact') options.redact = true;
    else if (arg === '--no-color') options.noColor = true;
    else if (arg === '--lang') {
      const language = args[index + 1];
      if (language !== 'de' && language !== 'en') throw new Error('--lang must be "de" or "en"');
      options.language = language;
      index += 1;
    }
    else if (arg === '--help' || arg === '-h') options.command = 'help';
    else if (arg === '--version' || arg === '-v') options.command = 'version';
    else if (arg === '--interval' || arg === '--timeout') {
      const raw = args[index + 1];
      const value = Number(raw);
      if (!raw || !Number.isInteger(value) || value < (arg === '--interval' ? 500 : 100)) {
        throw new Error(`${arg} requires an integer of at least ${arg === '--interval' ? 500 : 100} ms`);
      }
      if (arg === '--interval') options.intervalMs = value;
      else options.timeoutMs = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
    index += 1;
  }
  return options;
}

function overallStatus(report: SystemReport): Severity {
  const order: Severity[] = ['ok', 'info', 'warn', 'error'];
  return report.results.reduce<Severity>((best, item) =>
    order.indexOf(item.status) > order.indexOf(best) ? item.status : best, 'ok');
}

function printSummary(report: SystemReport, noColor: boolean, language: Language): void {
  const color: Record<Severity, string> = { ok: '\u001b[32m', info: '\u001b[36m', warn: '\u001b[33m', error: '\u001b[31m' };
  for (const subsystem of report.results) {
    const badge = severityText(language, subsystem.status).padEnd(5);
    const prefix = noColor ? '' : color[subsystem.status];
    const suffix = noColor ? '' : '\u001b[0m';
    process.stdout.write(`${prefix}${badge}${suffix} ${subsystemText(language, subsystem.id)} — ${t(language, 'issueCount', { count: subsystem.findings.length })}\n`);
    for (const finding of subsystem.findings.filter((entry) => entry.severity === 'warn' || entry.severity === 'error')) {
      const item = localizeFinding(finding, language);
      process.stdout.write(`  ${severityText(language, item.severity)}: ${item.title} — ${item.cause}\n`);
      for (const step of item.steps) process.stdout.write(`    [${riskText(language, step.risk)}] ${step.text}\n`);
    }
  }
}

async function exportFiles(report: SystemReport): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = resolve(process.cwd(), `sysdoctor-report-${stamp}`);
  const markdownPath = `${base}.md`;
  const jsonPath = `${base}.json`;
  await Promise.all([
    writeFile(markdownPath, reportToMarkdown(report), { mode: 0o600 }),
    writeFile(jsonPath, reportToJson(report), { mode: 0o600 }),
  ]);
  return `${markdownPath} and ${jsonPath}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') {
    process.stdout.write(help);
    return;
  }
  if (options.command === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (process.platform !== 'linux') {
    process.stderr.write('sysdoctor is designed for Linux; some checks will be unavailable on this platform.\n');
  }
  const isInteractive = options.command === 'scan' && !options.noTui && !options.json
    && process.stdin.isTTY && process.stdout.isTTY;
  const savedSettings = await loadSettings();
  let language = options.language ?? savedSettings.language ?? detectLanguage();
  let mode: DisplayMode = savedSettings.mode ?? 'easy';
  if (options.language) {
    await saveSettings({ language: options.language });
  } else if ((!savedSettings.language || !savedSettings.mode) && isInteractive) {
    const setup = await chooseSetup(language, mode, options.noColor);
    language = setup.language;
    mode = setup.mode;
    await saveSettings(setup);
  }
  let report = await collectReport(options.timeoutMs);
  if (options.redact || options.command === 'report') report = anonymizeReport(report);
  if (options.command === 'report') {
    process.stdout.write(`Wrote ${await exportFiles(report)}\n`);
    return;
  }
  if (options.json) {
    process.stdout.write(reportToJson(report));
    return;
  }
  if (options.noTui || !process.stdin.isTTY || !process.stdout.isTTY) {
    printSummary(report, options.noColor, language);
    process.stdout.write(`${t(language, 'health')}: ${severityText(language, overallStatus(report))}\n`);
    return;
  }
  await startTui(report, {
    intervalMs: options.intervalMs,
    noColor: options.noColor,
    language,
    mode,
    async onLanguageChange(nextLanguage) {
      await saveSettings({ language: nextLanguage });
      language = nextLanguage;
    },
    async onModeChange(nextMode) {
      await saveSettings({ mode: nextMode });
      mode = nextMode;
    },
    async refresh() {
      const fresh = await collectReport(options.timeoutMs);
      return options.redact ? anonymizeReport(fresh) : fresh;
    },
    async exportReport() {
      const fresh = anonymizeReport(await collectReport(options.timeoutMs));
      return exportFiles(fresh);
    },
  });
}

main().catch((caught: unknown) => {
  const message = caught instanceof Error ? caught.message : String(caught);
  process.stderr.write(`sysdoctor: ${message}\n`);
  process.exitCode = 1;
});
