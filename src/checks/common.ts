import type {
  Evidence,
  Finding,
  ProbeContext,
  Severity,
  SubsystemId,
  SubsystemResult,
} from '../types.js';
import { commandText } from '../runner.js';

export function addCommandEvidence(
  evidence: Evidence[],
  result: Awaited<ReturnType<ProbeContext['run']>>,
): string {
  const output = commandText(result);
  evidence.push({
    source: [result.command, ...result.args].join(' '),
    output,
  });
  return output;
}

export function addFileEvidence(evidence: Evidence[], path: string, content: string | null): string {
  const output = content?.trim() || `${path}: unavailable`;
  evidence.push({ source: path, output });
  return output;
}

export function finding(
  id: string,
  severity: Severity,
  component: string,
  title: string,
  cause: string,
  evidence: string[],
  steps: Finding['steps'],
): Finding {
  return { id, severity, component, title, cause, evidence, steps };
}

export function result(
  id: SubsystemId,
  label: string,
  findings: Finding[],
  evidence: Evidence[],
  metrics: string[] = [],
  now = new Date(),
): SubsystemResult {
  const priority: Record<Severity, number> = { ok: 0, info: 1, warn: 2, error: 3 };
  const status = findings.reduce<Severity>(
    (current, item) => priority[item.severity] > priority[current] ? item.severity : current,
    'ok',
  );
  return { id, label, status, metrics, findings, evidence, scannedAt: now.toISOString() };
}

export function commandProblem(output: string): string | null {
  const lower = output.toLowerCase();
  if (/timed out|timeout/.test(lower)) return 'The diagnostic command timed out; the service or system may be stalled.';
  if (/permission denied|access denied|operation not permitted/.test(lower)) {
    return 'The command was denied by permissions; some details may require elevated access.';
  }
  if (/dependency failed|dependency .* failed|failed to start.*dependency/.test(lower)) {
    return 'A required unit or device dependency failed to start.';
  }
  if (/sandbox|operation not permitted|apparmor|selinux/.test(lower)) {
    return 'A security policy or service sandbox may be preventing the operation.';
  }
  return null;
}
