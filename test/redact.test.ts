import { describe, expect, it } from 'vitest';
import { redactText } from '../src/redact.js';

describe('redactText', () => {
  it('masks username, home path, and hostname', () => {
    const output = redactText('/home/alice owned by alice on laptop-7', {
      username: 'alice',
      hostname: 'laptop-7',
    });
    expect(output).toBe('/home/<user> owned by <user> on <host>');
  });

  it('masks non-loopback IPv4/IPv6, MACs, and UUIDs while preserving loopback', () => {
    const output = redactText('host 192.0.2.9 ::ffff:192.0.2.10 fe80::1 aa:bb:cc:dd:ee:ff 123e4567-e89b-12d3-a456-426614174000 127.0.0.1 ::1');
    expect(output).toContain('<ip>');
    expect(output).toContain('<mac>');
    expect(output).toContain('<uuid>');
    expect(output).toContain('127.0.0.1');
    expect(output).toContain('::1');
    expect(output).not.toContain('192.0.2.9');
    expect(output).not.toContain('fe80::1');
    expect(output).not.toContain('::ffff:192.0.2.10');
  });

  it('leaves invalid IPv4-looking text unchanged', () => {
    expect(redactText('999.999.999.999')).toBe('999.999.999.999');
  });
});
