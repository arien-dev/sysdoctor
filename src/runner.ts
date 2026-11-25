import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import type { CommandResult, ProbeContext } from './types.js';

const executeFile = promisify(execFile);
const MAX_BUFFER = 1024 * 1024;

export async function runCommand(
  command: string,
  args: string[] = [],
  timeoutMs = 3000,
): Promise<CommandResult> {
  try {
    const result = await executeFile(command, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER,
      killSignal: 'SIGKILL',
      windowsHide: true,
    });
    return {
      command,
      args,
      stdout: result.stdout,
      stderr: result.stderr,
      code: 0,
    };
  } catch (caught) {
    const error = caught as Error & {
      code?: string | number;
      killed?: boolean;
      signal?: NodeJS.Signals;
      stdout?: string;
      stderr?: string;
    };
    const code = typeof error.code === 'number' ? error.code : null;
    return {
      command,
      args,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
      code,
      error: classifyCommandError(error.code, error.killed, error.signal),
    };
  }
}

export function classifyCommandError(
  code: string | number | undefined,
  killed = false,
  signal?: NodeJS.Signals,
): NonNullable<CommandResult['error']> {
  if (code === 'ENOENT') return 'missing-command';
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied';
  if (killed || signal === 'SIGKILL' || signal === 'SIGTERM') return 'timeout';
  return 'failed';
}

export function createProbeContext(timeoutMs = 3000): ProbeContext {
  return {
    run: (command, args = []) => runCommand(command, args, timeoutMs),
    async read(path) {
      try {
        return await readFile(path, 'utf8');
      } catch {
        return null;
      }
    },
    env: (name) => process.env[name],
    now: () => new Date(),
  };
}

export function commandText(result: CommandResult): string {
  const text = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n');
  if (text) return text;
  if (result.error === 'missing-command') return `${result.command}: command not installed`;
  if (result.error === 'permission-denied') return `${result.command}: permission denied`;
  if (result.error === 'timeout') return `${result.command}: timed out`;
  if (result.code !== 0 && result.code !== null) return `${result.command}: exited with status ${result.code}`;
  return `${result.command}: no output`;
}
