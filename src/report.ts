import {
  cpus,
  freemem,
  hostname as getHostname,
  loadavg,
  release as kernelRelease,
  totalmem,
  uptime,
  userInfo,
} from 'node:os';
import { readFile } from 'node:fs/promises';
import { redactText, type RedactionOptions } from './redact.js';
import type { SystemReport } from './types.js';
import { runChecks } from './checks/index.js';
import { createProbeContext } from './runner.js';

export const VERSION = '1.0.0';

export async function collectReport(timeoutMs = 3000): Promise<SystemReport> {
  const ctx = createProbeContext(timeoutMs);
  let distro = 'Linux distribution unknown';
  let memoryAvailableBytes = freemem();
  try {
    const releaseFile = await readFile('/etc/os-release', 'utf8');
    const name = releaseFile.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1];
    if (name) distro = name;
  } catch {
    distro = 'Linux distribution unknown';
  }
  try {
    const memoryInfo = await readFile('/proc/meminfo', 'utf8');
    const availableKb = memoryInfo.match(/^MemAvailable:\s+(\d+)\s+kB/m)?.[1];
    if (availableKb) memoryAvailableBytes = Number(availableKb) * 1024;
  } catch {
    memoryAvailableBytes = freemem();
  }
  const memoryTotalBytes = totalmem();
  const load = loadavg();
  return {
    version: VERSION,
    hostname: getHostname(),
    kernel: kernelRelease(),
    distro,
    generatedAt: new Date().toISOString(),
    system: {
      cpuCount: cpus().length,
      loadAverage: [load[0] ?? 0, load[1] ?? 0, load[2] ?? 0],
      uptimeSeconds: uptime(),
      memoryTotalBytes,
      memoryAvailableBytes,
      memoryUsedPercent: memoryTotalBytes === 0
        ? 0
        : Math.max(0, Math.min(100, Math.round((1 - memoryAvailableBytes / memoryTotalBytes) * 100))),
    },
    results: await runChecks(ctx),
  };
}

export function anonymizeReport(report: SystemReport): SystemReport {
  let username = '';
  try {
    username = userInfo().username;
  } catch {
    username = '';
  }
  const options: RedactionOptions = { username, hostname: report.hostname };
  const text = (value: string): string => redactText(value, options);
  return {
    ...report,
    hostname: '<host>',
    distro: text(report.distro),
    kernel: text(report.kernel),
    results: report.results.map((item) => ({
      ...item,
      metrics: item.metrics.map(text),
      findings: item.findings.map((entry) => ({
        ...entry,
        component: text(entry.component),
        title: text(entry.title),
        cause: text(entry.cause),
        evidence: entry.evidence.map(text),
        steps: entry.steps.map((step) => ({ ...step, text: text(step.text) })),
      })),
      evidence: item.evidence.map((entry) => ({
        source: text(entry.source),
        output: text(entry.output),
      })),
    })),
  };
}

export function reportToJson(report: SystemReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function reportToMarkdown(report: SystemReport): string {
  const lines = [
    '# sysdoctor diagnostic report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Host: ${report.hostname}`,
    `- Kernel: ${report.kernel}`,
    `- Distribution: ${report.distro}`,
    `- CPU cores: ${report.system.cpuCount}`,
    `- Load average: ${report.system.loadAverage.map((value) => value.toFixed(2)).join(' / ')}`,
    `- Memory: ${report.system.memoryUsedPercent}% used (${Math.round(report.system.memoryAvailableBytes / 1024 / 1024)} MiB available)`,
    `- Uptime: ${Math.floor(report.system.uptimeSeconds / 3600)} hours`,
    '',
  ];
  for (const subsystem of report.results) {
    lines.push(`## ${subsystem.label} — ${subsystem.status.toUpperCase()}`, '');
    if (subsystem.metrics.length) lines.push(`Metrics: ${subsystem.metrics.join(' · ')}`, '');
    for (const item of subsystem.findings) {
      lines.push(`### ${item.severity.toUpperCase()}: ${item.title}`, '', item.cause, '');
      if (item.evidence.length) {
        lines.push('Evidence:', ...item.evidence.map((line) => `- ${line}`), '');
      }
      if (item.steps.length) {
        lines.push('Suggested steps:', ...item.steps.map((step) => `- **${step.risk}** ${step.text}`), '');
      }
    }
    for (const evidence of subsystem.evidence) {
      lines.push(`<details><summary>${evidence.source}</summary>`, '', '```text', evidence.output, '```', '</details>', '');
    }
  }
  return `${lines.join('\n').trim()}\n`;
}
