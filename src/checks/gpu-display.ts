import type { Evidence, Finding, ProbeContext, SubsystemResult } from '../types.js';
import { addCommandEvidence, finding, result } from './common.js';

export async function checkGpuDisplay(ctx: ProbeContext): Promise<SubsystemResult> {
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const session = [
    `XDG_SESSION_TYPE=${ctx.env('XDG_SESSION_TYPE') ?? '(unset)'}`,
    `WAYLAND_DISPLAY=${ctx.env('WAYLAND_DISPLAY') ?? '(unset)'}`,
    `DISPLAY=${ctx.env('DISPLAY') ?? '(unset)'}`,
  ].join('\n');
  evidence.push({ source: 'session environment', output: session });
  const [pci, drm, journal] = await Promise.all([
    ctx.run('lspci', ['-nn']),
    ctx.run('ls', ['/sys/class/drm']),
    ctx.run('journalctl', ['-k', '-b', '-n', '400', '--no-pager', '--output=short-iso']),
  ]);
  const pciText = addCommandEvidence(evidence, pci);
  const drmText = addCommandEvidence(evidence, drm);
  const journalText = addCommandEvidence(evidence, journal);
  const gpuDevices = pciText.split('\n').filter((line) => /VGA compatible controller|3D controller|Display controller/i.test(line));
  const gpuErrors = journalText.split('\n').filter((line) =>
    /drm|gpu|amdgpu|i915|nouveau|nvidia/i.test(line) && /modeset|reset|hang|fault|error|failed/i.test(line));
  if (gpuErrors.length) findings.push(finding('gpu-kernel-errors', 'warn', 'GPU driver',
    'GPU or display driver errors found', 'Modesetting failures, GPU resets, or driver faults can cause a black screen, flicker, or lost acceleration.',
    gpuErrors.slice(-15), [{ risk: 'read-only', text: 'Identify the GPU driver and correlate these log entries with the display failure.' }]));
  if (!gpuDevices.length && pci.error !== 'missing-command') findings.push(finding('gpu-no-device', 'info', 'graphics hardware',
    'No display controller identified by lspci', 'The device may be hidden by permissions, a virtual machine, or unavailable PCI tooling.',
    [pciText, drmText], [{ risk: 'read-only', text: 'Check the active display session and available /sys/class/drm connectors.' }]));
  if (!gpuErrors.length && !findings.length) findings.push(finding('gpu-inspected', 'info', 'display',
    `${gpuDevices.length} display controller(s) detected`,
    'Display environment and kernel logs were inspected; no matching recent GPU errors were found.',
    [session, ...gpuDevices, drmText].filter(Boolean), []));
  return result('gpu-display', 'gpu-display', findings, evidence,
    [`${gpuDevices.length} display controller(s)`, ctx.env('XDG_SESSION_TYPE') ?? 'session unknown'], ctx.now());
}
