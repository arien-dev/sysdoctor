import type { Evidence, Finding, ProbeContext, SubsystemResult } from '../types.js';
import { addCommandEvidence, addFileEvidence, finding, result } from './common.js';

export async function checkSuspend(ctx: ProbeContext): Promise<SubsystemResult> {
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const [memSleep, wakeup, journal] = await Promise.all([
    ctx.read('/sys/power/mem_sleep'),
    ctx.read('/proc/acpi/wakeup'),
    ctx.run('journalctl', ['-b', '-n', '500', '--no-pager', '--output=short-iso']),
  ]);
  const sleepText = addFileEvidence(evidence, '/sys/power/mem_sleep', memSleep);
  const wakeText = addFileEvidence(evidence, '/proc/acpi/wakeup', wakeup);
  const journalText = addCommandEvidence(evidence, journal);
  const activeMode = sleepText.match(/\[([^\]]+)\]/)?.[1];
  if (memSleep && !activeMode) findings.push(finding('suspend-no-mode', 'warn', 'sleep mode',
    'No active suspend mode indicated', 'The kernel did not expose a selected mem_sleep mode; suspend support may be limited by firmware or the platform.',
    [sleepText], [{ risk: 'read-only', text: 'Check firmware power settings and the kernel boot log for suspend capability messages.' }]));
  const enabledWakeups = wakeText.split('\n').filter((line) => /\*\s+enabled\b/.test(line));
  const suspendLines = journalText.split('\n').filter((line) =>
    /suspend|resume|sleep|wakeup/i.test(line) && /fail|error|timeout|hang|failed/i.test(line));
  if (suspendLines.length) findings.push(finding('suspend-journal-errors', 'warn', 'suspend/resume',
    'Recent suspend or resume errors', 'A device driver, firmware wake source, or system sleep hook may be blocking or interrupting the transition.',
    suspendLines.slice(-15), [{ risk: 'read-only', text: 'Compare the timestamps with the failed sleep attempt and identify the named device or driver.' }]));
  if (!findings.length) findings.push(finding('suspend-inspected', 'info', 'suspend',
    activeMode ? `Kernel sleep mode: ${activeMode}` : 'No recent suspend failure found',
    'Suspend capability and enabled ACPI wake sources are shown for inspection; no matching recent transition errors were found.',
    [sleepText, ...enabledWakeups.slice(0, 12)], []));
  return result('suspend', 'suspend', findings, evidence,
    [`${enabledWakeups.length} wake sources enabled`, activeMode ? `${activeMode} mode` : 'mode unavailable'], ctx.now());
}
