import type { Evidence, Finding, ProbeContext, SubsystemResult } from '../types.js';
import { addCommandEvidence, addFileEvidence, finding, result } from './common.js';

export async function checkMemoryCpu(ctx: ProbeContext): Promise<SubsystemResult> {
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const [meminfo, loadavg, memoryPressure, cpuPressure, processes, journal] = await Promise.all([
    ctx.read('/proc/meminfo'),
    ctx.read('/proc/loadavg'),
    ctx.read('/proc/pressure/memory'),
    ctx.read('/proc/pressure/cpu'),
    ctx.run('ps', ['-eo', 'pid,comm,%cpu,%mem', '--sort=-%cpu']),
    ctx.run('journalctl', ['-k', '-b', '-n', '400', '--no-pager', '--output=short-iso']),
  ]);
  const memoryText = addFileEvidence(evidence, '/proc/meminfo', meminfo);
  const loadText = addFileEvidence(evidence, '/proc/loadavg', loadavg);
  const memoryPsi = addFileEvidence(evidence, '/proc/pressure/memory', memoryPressure);
  const cpuPsi = addFileEvidence(evidence, '/proc/pressure/cpu', cpuPressure);
  const processText = addCommandEvidence(evidence, processes);
  const journalText = addCommandEvidence(evidence, journal);
  if (!meminfo) findings.push(finding('memory-proc-unavailable', 'info', 'procfs',
    'Memory metrics are unavailable', 'The kernel memory counters could not be read from /proc/meminfo.',
    [memoryText], [{ risk: 'read-only', text: 'Run this diagnostic on Linux with procfs mounted.' }]));
  const values = new Map([...memoryText.matchAll(/^(MemTotal|MemAvailable):\s+(\d+)\s+kB/gm)]
    .map((match) => [match[1]!, Number(match[2])]));
  const total = values.get('MemTotal');
  const available = values.get('MemAvailable');
  if (total && available !== undefined) {
    const percent = Math.round((1 - available / total) * 100);
    if (percent > 95) findings.push(finding('memory-critical', 'error', 'memory',
      `Memory utilization is ${percent}%`, 'Very little memory is available; allocations may fail or the kernel may invoke the OOM killer.',
      [`MemAvailable ${available} kB of ${total} kB`, memoryPsi], [{ risk: 'read-only', text: 'Inspect the largest memory consumers and memory pressure before stopping any process.' }]));
    else if (percent > 85) findings.push(finding('memory-high', 'warn', 'memory',
      `Memory utilization is ${percent}%`, 'Low available memory can trigger reclaim stalls and slow application response.',
      [`MemAvailable ${available} kB of ${total} kB`, memoryPsi], [{ risk: 'read-only', text: 'Inspect memory consumers and the memory PSI some/full averages.' }]));
  }
  const oom = journalText.split('\n').filter((line) => /out of memory|oom-kill|killed process/i.test(line));
  if (oom.length) findings.push(finding('memory-oom', 'error', 'kernel memory manager',
    'Kernel OOM events detected', 'The kernel terminated a process because memory could not be reclaimed quickly enough.',
    oom.slice(-12), [{ risk: 'read-only', text: 'Review the affected process, memory consumers, and available system memory.' }]));
  const load = loadText.split(/\s+/)[0];
  const cpuFull = cpuPressure?.match(/^some\s+.*?avg10=([\d.]+)/m)?.[1];
  if (cpuFull && Number(cpuFull) > 20) findings.push(finding('cpu-pressure', 'warn', 'CPU pressure',
    `CPU pressure avg10 is ${cpuFull}%`, 'Runnable tasks are spending significant time waiting for CPU, which may explain slow responses.',
    [loadText, cpuPsi], [{ risk: 'read-only', text: 'Inspect the load average and active CPU consumers; compare load with the number of online CPUs.' }]));
  if (!findings.length) findings.push(finding('memory-cpu-healthy', 'ok', 'memory and CPU',
    'No critical memory or CPU pressure found', 'Memory availability, available pressure metrics, and recent kernel logs show no matching critical condition.',
    [memoryText, loadText, memoryPsi, cpuPsi].filter(Boolean), []));
  return result('memory-cpu', 'memory-cpu', findings, evidence,
    [`${available ?? 'unknown'} kB available`, `load ${load || 'unknown'}`,
      ...processText.split('\n').slice(0, 4)], ctx.now());
}
