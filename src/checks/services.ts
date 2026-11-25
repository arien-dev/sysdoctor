import type { Evidence, Finding, ProbeContext, SubsystemResult } from '../types.js';
import { addCommandEvidence, commandProblem, finding, result } from './common.js';

export async function checkServices(ctx: ProbeContext): Promise<SubsystemResult> {
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const failedSystem = await ctx.run('systemctl', ['--failed', '--no-legend', '--no-pager']);
  const failedUser = await ctx.run('systemctl', ['--user', '--failed', '--no-legend', '--no-pager']);
  const systemText = addCommandEvidence(evidence, failedSystem);
  const userText = addCommandEvidence(evidence, failedUser);
  const units = [
    ...parseUnits(systemText).map((unit) => ({ unit, scope: 'system' as const })),
    ...parseUnits(userText).map((unit) => ({ unit, scope: 'user' as const })),
  ];

  if (failedSystem.error === 'missing-command' || (failedSystem.code !== 0 && units.length === 0)) {
    findings.push(finding('services-systemctl-missing', 'info', 'systemd',
      'system service query unavailable', failedSystem.error === 'missing-command'
        ? 'This host may not use systemd, so service-unit health cannot be queried.'
        : 'systemctl could not query system service state, possibly because this host is not running systemd.',
      [systemText], [{ risk: 'read-only', text: 'Use the service manager provided by this Linux distribution.' }]));
  }
  for (const [scope, output] of [['system', systemText], ['user', userText]] as const) {
    const issue = commandProblem(output);
    if (issue) findings.push(finding(`services-${scope}-access`, 'info', `systemctl (${scope})`,
      'Service details unavailable', issue, [output], [
        { risk: 'read-only', text: 'Run systemctl --failed manually to inspect the available service state.' },
      ]));
  }
  for (const { unit, scope } of units.slice(0, 8)) {
    const logs = await ctx.run('journalctl', [
      ...(scope === 'user' ? ['--user'] : []),
      '-u', unit, '-n', '25', '--no-pager', '--output=short-iso',
    ]);
    const logText = addCommandEvidence(evidence, logs);
    const cause = commandProblem(logText);
    findings.push(finding(`failed-${unit}`, 'error', unit, 'Unit is in failed state',
      cause ?? 'systemd recorded this unit as failed; common causes include a non-zero exit, missing dependency, permissions, or sandbox restrictions.',
      [outputLine(scope === 'system' ? systemText : userText, unit), logText].filter(Boolean),
      [
        { risk: 'read-only', text: `Inspect with systemctl status ${unit} and journalctl -u ${unit} -n 25.` },
        { risk: 'caution', text: `Only after understanding the cause, consider restarting ${unit}.` },
      ]));
  }
  const degraded = await ctx.run('systemctl', ['is-system-running']);
  const degradedText = addCommandEvidence(evidence, degraded);
  if (/degraded/i.test(degradedText) && !findings.some((item) => item.title === 'Unit is in failed state')) {
    findings.push(finding('services-degraded', 'warn', 'systemd', 'System is degraded',
      'At least one system service has not reached a healthy state, though the failed-unit listing may be unavailable.',
      [degradedText], [{ risk: 'read-only', text: 'Review systemctl --failed and the boot journal.' }]));
  }
  if (findings.length === 0) findings.push(finding('services-healthy', 'ok', 'systemd',
    'No failed services reported', 'Systemd reports no failed units in the queried scopes.',
    [systemText, userText].filter(Boolean), []));
  return result('services', 'services', findings, evidence, [`${units.length} failed/degraded units`], ctx.now());
}

function parseUnits(output: string): string[] {
  return [...new Set(output.split('\n')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((unit): unit is string => unit !== undefined
      && (unit.endsWith('.service') || unit.endsWith('.target') || unit.endsWith('.socket'))))];
}

function outputLine(output: string, unit: string): string {
  return output.split('\n').find((line) => line.includes(unit)) ?? '';
}
