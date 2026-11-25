import type { Evidence, Finding, ProbeContext, SubsystemResult } from '../types.js';
import { addCommandEvidence, finding, result } from './common.js';

export async function checkBluetooth(ctx: ProbeContext): Promise<SubsystemResult> {
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const [active, blocks, controllers, show, journal] = await Promise.all([
    ctx.run('systemctl', ['is-active', 'bluetooth']),
    ctx.run('rfkill', ['list']),
    ctx.run('bluetoothctl', ['list']),
    ctx.run('bluetoothctl', ['show']),
    ctx.run('journalctl', ['-u', 'bluetooth', '-b', '-n', '150', '--no-pager', '--output=short-iso']),
  ]);
  const activeText = addCommandEvidence(evidence, active);
  const blockText = addCommandEvidence(evidence, blocks);
  const controllerText = addCommandEvidence(evidence, controllers);
  const showText = addCommandEvidence(evidence, show);
  const journalText = addCommandEvidence(evidence, journal);
  if (blocks.error === 'missing-command') findings.push(finding('bluetooth-rfkill-missing', 'info',
    'rfkill', 'rfkill utility is unavailable', 'Radio block state could not be queried with rfkill.',
    [blockText], [{ risk: 'read-only', text: 'Check the hardware radio switch and Bluetooth service state.' }]));
  if (controllers.error === 'missing-command') findings.push(finding('bluetoothctl-missing', 'info',
    'Bluetooth control', 'bluetoothctl is unavailable', 'Controller enumeration could not be run because BlueZ command-line tools are unavailable.',
    [controllerText, showText], [{ risk: 'read-only', text: 'Check whether BlueZ is installed and the Bluetooth service is available.' }]));
  const blocked = /Soft blocked:\s*yes|Hard blocked:\s*yes/i.test(blockText);
  if (active.code !== 0 && active.error !== 'missing-command' && !/command not installed/.test(activeText)) {
    findings.push(finding('bluetooth-service-inactive', 'warn', 'bluetoothd', 'Bluetooth service is not active',
      'Without the Bluetooth daemon, controllers cannot be managed or connected to peripherals.',
      [activeText], [{ risk: 'read-only', text: 'Check systemctl status bluetooth and the associated journal entries.' },
        { risk: 'reversible', text: 'If Bluetooth is expected, start the service using your system service manager.' }]));
  }
  if (blocked) findings.push(finding('bluetooth-radio-blocked', 'error', 'radio state', 'Bluetooth radio is blocked',
    'A software or hardware rfkill block prevents the Bluetooth radio from operating.',
    blockText.split('\n').filter((line) => /blocked:\s*yes/i.test(line)),
    [{ risk: 'read-only', text: 'Identify whether rfkill reports a soft block or a hardware switch.' },
      { risk: 'reversible', text: 'Clear a soft block only if you intend to enable the radio; a hardware block needs its physical switch.' }]));
  if (controllers.error !== 'missing-command' && show.error !== 'missing-command'
    && !/Controller [\da-f:]+/i.test(`${controllerText}\n${showText}`)
    && !/No default controller available/i.test(showText)) {
    findings.push(finding('bluetooth-no-controller', 'warn', 'Bluetooth controller', 'No controller detected',
      'The adapter may be disabled, missing firmware, blocked, or unavailable to the Bluetooth service.',
      [controllerText, showText], [{ risk: 'read-only', text: 'Check rfkill state, adapter presence, firmware messages, and the Bluetooth service.' }]));
  }
  const errors = journalText.split('\n').filter((line) =>
    /firmware|hci|auth|bluetooth/i.test(line) && /error|failed|timeout|not found|denied/i.test(line));
  if (errors.length) findings.push(finding('bluetooth-journal-errors', 'warn', 'Bluetooth stack',
    'Bluetooth firmware, HCI, or authentication errors',
    'Adapter initialization, firmware loading, or device authentication has emitted errors.',
    errors.slice(-12), [{ risk: 'read-only', text: 'Check the adapter model, firmware package availability, and the peer device pairing state.' }]));
  if (!findings.length) findings.push(finding('bluetooth-inspected', 'info', 'bluetooth',
    'No Bluetooth blocker detected', 'The service, radio state, controller, and recent Bluetooth journal were inspected.',
    [activeText, blockText, controllerText, showText].filter(Boolean), []));
  return result('bluetooth', 'bluetooth', findings, evidence,
    [activeText.trim() || 'service unknown', blocked ? 'radio blocked' : 'radio unblocked'], ctx.now());
}
