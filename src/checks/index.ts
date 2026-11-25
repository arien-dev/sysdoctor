import type { ProbeContext, SubsystemResult } from '../types.js';
import { checkAudio } from './audio.js';
import { checkBluetooth } from './bluetooth.js';
import { checkGpuDisplay } from './gpu-display.js';
import { checkMemoryCpu } from './memory-cpu.js';
import { checkNetwork } from './network.js';
import { checkServices } from './services.js';
import { checkStorage } from './storage.js';
import { checkSuspend } from './suspend.js';

export const checks = [
  checkServices,
  checkAudio,
  checkBluetooth,
  checkNetwork,
  checkStorage,
  checkSuspend,
  checkGpuDisplay,
  checkMemoryCpu,
] as const;

export async function runChecks(ctx: ProbeContext): Promise<SubsystemResult[]> {
  return Promise.all(checks.map(async (check) => {
    try {
      return await check(ctx);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const id = check.name.replace(/^check/, '').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, '');
      return {
        id: id as SubsystemResult['id'],
        label: id,
        status: 'error',
        metrics: [],
        findings: [{
          id: `${id}-check-failed`,
          severity: 'error',
          component: id,
          title: 'Diagnostic check failed',
          cause: message,
          evidence: [],
          steps: [{ risk: 'read-only', text: 'Re-run the check and inspect the underlying command or file access error.' }],
        }],
        evidence: [],
        scannedAt: ctx.now().toISOString(),
      };
    }
  }));
}
