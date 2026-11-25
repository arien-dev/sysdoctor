import type { Evidence, Finding, ProbeContext, SubsystemResult } from '../types.js';
import { addCommandEvidence, addFileEvidence, finding, result } from './common.js';

export async function checkAudio(ctx: ProbeContext): Promise<SubsystemResult> {
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const [processes, wpctl, pactlInfo, sinks, cards, journal] = await Promise.all([
    ctx.run('ps', ['-eo', 'comm=']),
    ctx.run('wpctl', ['status']),
    ctx.run('pactl', ['info']),
    ctx.run('pactl', ['list', 'short', 'sinks']),
    ctx.read('/proc/asound/cards'),
    ctx.run('journalctl', ['-b', '-n', '300', '--no-pager', '--output=short-iso']),
  ]);
  const processText = addCommandEvidence(evidence, processes);
  const wpctlText = addCommandEvidence(evidence, wpctl);
  const infoText = addCommandEvidence(evidence, pactlInfo);
  const sinkText = addCommandEvidence(evidence, sinks);
  const cardText = addFileEvidence(evidence, '/proc/asound/cards', cards);
  const journalText = addCommandEvidence(evidence, journal);
  const audioProcesses = ['pipewire', 'wireplumber', 'pipewire-pulse', 'pulseaudio']
    .filter((name) => new RegExp(`(^|\\s)${name.replace('-', '\\-')}($|\\s)`, 'm').test(processText));
  const sinkCount = sinks.stdout.trim().split('\n').filter(Boolean).length;

  if (!audioProcesses.length && !/Server Name:.*PulseAudio/i.test(infoText) && !wpctlText.includes('Audio')) {
    findings.push(finding('audio-no-server', 'warn', 'audio server', 'No audio server detected',
      'PipeWire/PulseAudio is not visible to the current user, which commonly leaves applications without an audio server.',
      [processText, wpctlText, infoText], [
        { risk: 'read-only', text: 'Check user services with systemctl --user status pipewire wireplumber.' },
        { risk: 'reversible', text: 'If expected on this system, start the audio user service using your desktop session tools.' },
      ]));
  }
  if (/no such file|connection refused|not running|command not installed/i.test(`${wpctlText}\n${infoText}`)) {
    findings.push(finding('audio-control-unavailable', 'info', 'audio control', 'Audio control interface unavailable',
      'The session bus, audio server, or optional control utility could not be reached.',
      [wpctlText, infoText], [{ risk: 'read-only', text: 'Check that the desktop user session and audio server are running.' }]));
  }
  if ((sinks.code !== 0 && !sinks.error) || (sinks.code === 0 && sinkCount === 0)) {
    findings.push(finding('audio-no-sinks', 'error', 'audio output', 'No sink list returned',
      'The audio server did not return output devices; device discovery, profile selection, or server startup may have failed.',
      [sinkText, cardText], [{ risk: 'read-only', text: 'Compare pactl sinks with /proc/asound/cards and inspect audio service logs.' }]));
  }
  const defaultSink = infoText.match(/^Default Sink:\s*(.*)$/mi)?.[1]?.trim();
  if (pactlInfo.code === 0 && defaultSink !== undefined && /^(none|n\/a)$/i.test(defaultSink)) {
    findings.push(finding('audio-no-default-sink', 'warn', 'audio output', 'No default output sink selected',
      'An audio server is responding but applications may have no default playback device.',
      [infoText, sinkText], [{ risk: 'read-only', text: 'Inspect available sinks and the desktop audio profile before selecting an output device.' }]));
  }
  const audioErrors = journalText.split('\n').filter((line) =>
    /pipewire|wireplumber|pulseaudio|alsa/i.test(line) && /error|failed|no such|timeout|firmware/i.test(line));
  if (audioErrors.length) findings.push(finding('audio-journal-errors', 'warn', 'audio stack',
    'Audio-related errors in journal', 'The audio stack has emitted recent errors that may explain missing devices or silent output.',
    audioErrors.slice(-12), [{ risk: 'read-only', text: 'Inspect the listed audio service log context and confirm the selected output profile.' }]));
  if (findings.length === 0) findings.push(finding('audio-available', 'ok', 'audio',
    'Audio stack appears available', 'An audio server or ALSA device is visible and no matching recent errors were found.',
    [wpctlText, infoText, cardText].filter(Boolean), []));
  return result('audio', 'audio', findings, evidence,
    [`${audioProcesses.length} audio processes`, `${sinkCount} sinks`], ctx.now());
}
