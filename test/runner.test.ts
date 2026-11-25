import { describe, expect, it } from 'vitest';
import { classifyCommandError, runCommand } from '../src/runner.js';

describe('runCommand', () => {
  it('runs a program with separate arguments and captures output', async () => {
    const result = await runCommand(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', 'safe value']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('safe value');
  });

  it('reports a missing executable without throwing', async () => {
    const result = await runCommand('sysdoctor-command-that-does-not-exist');
    expect(result.error).toBe('missing-command');
    expect(result.code).toBeNull();
  });

  it('classifies permission failures distinctly from missing commands', () => {
    expect(classifyCommandError('EACCES')).toBe('permission-denied');
    expect(classifyCommandError('ENOENT')).toBe('missing-command');
  });

  it('terminates commands that exceed the timeout', async () => {
    const result = await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], 100);
    expect(result.error).toBe('timeout');
  });
});
