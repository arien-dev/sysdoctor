import type { Evidence, Finding, ProbeContext, SubsystemResult } from '../types.js';
import { addCommandEvidence, addFileEvidence, finding, result } from './common.js';

export async function checkStorage(ctx: ProbeContext): Promise<SubsystemResult> {
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const [space, inodes, mounts, kernel, journal] = await Promise.all([
    ctx.run('df', ['-hP']),
    ctx.run('df', ['-iP']),
    ctx.read('/proc/mounts'),
    ctx.run('journalctl', ['-k', '-b', '-n', '300', '--no-pager', '--output=short-iso']),
    ctx.run('journalctl', ['-b', '-n', '300', '--no-pager', '--output=short-iso']),
  ]);
  const spaceText = addCommandEvidence(evidence, space);
  const inodeText = addCommandEvidence(evidence, inodes);
  const mountText = addFileEvidence(evidence, '/proc/mounts', mounts);
  const kernelText = addCommandEvidence(evidence, kernel);
  const journalText = addCommandEvidence(evidence, journal);
  if (space.code !== 0 || inodes.code !== 0) {
    findings.push(finding('storage-df-missing', 'info', 'filesystem tools', 'Filesystem utilization query incomplete',
      'Filesystem space or inode utilization could not be fully queried because one or more df probes failed.',
      [spaceText, inodeText], [{ risk: 'read-only', text: 'Use the distribution-provided df utility to inspect filesystem capacity.' }]));
  }

  for (const [kind, text] of [['space', spaceText], ['inode', inodeText]] as const) {
    for (const line of text.split('\n').slice(1)) {
      const percent = line.match(/\s(\d{1,3})%\s+\S+$/)?.[1];
      if (!percent) continue;
      const used = Number(percent);
      if (used > 95) findings.push(finding(`storage-${kind}-${line.trim().split(/\s+/).at(-1)}`, 'error',
        kind === 'space' ? 'filesystem capacity' : 'filesystem inodes', `${kind} usage is ${used}%`,
        'The filesystem is nearly exhausted; writes, logs, package operations, or application startup may fail.',
        [line], [{ risk: 'read-only', text: `Review ${kind === 'space' ? 'df -hP' : 'df -iP'} to find the affected mount and its largest consumers.` },
          { risk: 'caution', text: 'Remove or rotate data only after identifying what owns it and confirming it is safe to delete.' }]));
      else if (used > 85) findings.push(finding(`storage-${kind}-${line.trim().split(/\s+/).at(-1)}`, 'warn',
        kind === 'space' ? 'filesystem capacity' : 'filesystem inodes', `${kind} usage is ${used}%`,
        'High filesystem utilization can soon prevent writes or creation of new files.',
        [line], [{ risk: 'read-only', text: `Review ${kind === 'space' ? 'df -hP' : 'df -iP'} and locate the growing consumer.` }]));
    }
  }
  const readonly = mountText.split('\n').filter((line) => {
    const fields = line.split(' ');
    return fields[3]?.split(',').includes('ro') && !['proc', 'sysfs', 'devtmpfs', 'tmpfs', 'cgroup', 'cgroup2'].includes(fields[2] ?? '');
  });
  if (readonly.length) findings.push(finding('storage-readonly-mounts', 'warn', 'mounts',
    `${readonly.length} read-only mount(s)`, 'An unexpected read-only filesystem prevents writes; the kernel may have remounted it after I/O or filesystem errors.',
    readonly.slice(0, 10), [{ risk: 'read-only', text: 'Check kernel logs and filesystem health before attempting any remount.' }]));
  const ioErrors = `${kernelText}\n${journalText}`.split('\n').filter((line) =>
    /I\/O error|buffer I\/O|filesystem error|EXT4-fs error|BTRFS.*error|XFS.*error/i.test(line));
  if (ioErrors.length) findings.push(finding('storage-io-errors', 'error', 'kernel storage',
    'Kernel reports storage or filesystem errors', 'Device I/O faults or filesystem corruption can cause read-only mounts and data loss.',
    ioErrors.slice(-12), [{ risk: 'read-only', text: 'Back up accessible data and inspect device and filesystem health before repair operations.' },
      { risk: 'caution', text: 'Avoid running repair tools on a mounted filesystem; follow the filesystem-specific recovery procedure.' }]));
  if (findings.length === 0) findings.push(finding('storage-healthy', 'ok', 'storage',
    'No critical storage pressure detected', 'Reported capacity and inode utilization are below warning thresholds, with no matching I/O errors.',
    [spaceText, inodeText].filter(Boolean), []));
  return result('storage', 'storage', findings, evidence,
    [`${findings.filter((item) => item.id.startsWith('storage-space-')).length} capacity alerts`], ctx.now());
}
