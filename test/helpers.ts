import type { CommandResult, ProbeContext } from '../src/types.js';

export function fixtureContext(
  commands: Record<string, Partial<CommandResult>>,
  files: Record<string, string>,
): ProbeContext {
  return {
    async run(command, args = []) {
      const key = [command, ...args].join(' ');
      const data = commands[key] ?? {};
      return {
        command,
        args,
        stdout: data.stdout ?? '',
        stderr: data.stderr ?? '',
        code: data.code ?? 0,
        ...(data.error ? { error: data.error } : {}),
      };
    },
    async read(path) {
      return files[path] ?? null;
    },
    env: () => undefined,
    now: () => new Date('2026-01-02T03:04:05.000Z'),
  };
}
