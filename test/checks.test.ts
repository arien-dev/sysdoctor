import { describe, expect, it } from 'vitest';
import { checkAudio } from '../src/checks/audio.js';
import { checkNetwork } from '../src/checks/network.js';
import { checkMemoryCpu } from '../src/checks/memory-cpu.js';
import { checkServices } from '../src/checks/services.js';
import { checkStorage } from '../src/checks/storage.js';
import { fixtureContext } from './helpers.js';

describe('Linux diagnostic checks with fixtures', () => {
  it('traces failed services to their journal output', async () => {
    const ctx = fixtureContext({
      'systemctl --failed --no-legend --no-pager': { stdout: 'cups.service loaded failed failed Printing Service' },
      'systemctl --user --failed --no-legend --no-pager': {},
      'journalctl -u cups.service -n 25 --no-pager --output=short-iso': { stdout: 'Main process exited, code=exited, status=1/FAILURE' },
      'systemctl is-system-running': { stdout: 'degraded' },
    }, {});
    const result = await checkServices(ctx);
    expect(result.status).toBe('error');
    expect(result.findings[0]?.evidence.join(' ')).toContain('status=1');
  });

  it('explains a missing default route and network service errors', async () => {
    const ctx = fixtureContext({
      'ip -br addr': { stdout: 'lo UNKNOWN 127.0.0.1/8\nwlan0 DOWN' },
      'ip route': { stdout: '192.168.1.0/24 dev wlan0' },
      'resolvectl status': { stdout: 'Global\n       DNS Servers: 192.168.1.1' },
      'journalctl -b -n 300 --no-pager --output=short-iso': { stdout: 'NetworkManager: DHCP request failed' },
    }, { '/etc/resolv.conf': 'nameserver 192.168.1.1' });
    const result = await checkNetwork(ctx);
    expect(result.findings.map((item) => item.id)).toContain('network-no-gateway');
    expect(result.findings.map((item) => item.id)).toContain('network-down-interfaces');
    expect(result.findings.map((item) => item.id)).toContain('network-journal-errors');
  });

  it('flags filesystem capacity and unexpected read-only mounts', async () => {
    const ctx = fixtureContext({
      'df -hP': { stdout: 'Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 100G 97G 3G 97% /' },
      'df -iP': { stdout: 'Filesystem Inodes IUsed IFree IUse% Mounted on\n/dev/sda1 100 20 80 20% /' },
      'journalctl -k -b -n 300 --no-pager --output=short-iso': {},
      'journalctl -b -n 300 --no-pager --output=short-iso': {},
    }, { '/proc/mounts': '/dev/sda1 / ext4 ro,relatime 0 0' });
    const result = await checkStorage(ctx);
    expect(result.findings.some((item) => item.severity === 'error' && item.title.includes('97%'))).toBe(true);
    expect(result.findings.map((item) => item.id)).toContain('storage-readonly-mounts');
  });

  it('detects an absent audio server while keeping evidence for missing tools', async () => {
    const ctx = fixtureContext({
      'ps -eo comm=': {},
      'wpctl status': { error: 'missing-command', stderr: 'not found', code: null },
      'pactl info': { error: 'missing-command', stderr: 'not found', code: null },
      'pactl list short sinks': { error: 'missing-command', stderr: 'not found', code: null },
      'journalctl -b -n 300 --no-pager --output=short-iso': {},
    }, {});
    const result = await checkAudio(ctx);
    expect(result.findings.map((item) => item.id)).toContain('audio-no-server');
    expect(result.evidence.some((item) => item.source === 'wpctl status')).toBe(true);
  });

  it('correlates low memory, CPU pressure, and OOM evidence', async () => {
    const ctx = fixtureContext({
      'ps -eo pid,comm,%cpu,%mem --sort=-%cpu': {
        stdout: 'PID COMMAND %CPU %MEM\n100 browser 80.0 65.0',
      },
      'journalctl -k -b -n 400 --no-pager --output=short-iso': {
        stdout: 'kernel: Out of memory: Killed process 100 (browser)',
      },
    }, {
      '/proc/meminfo': 'MemTotal: 1000000 kB\nMemAvailable: 30000 kB\n',
      '/proc/loadavg': '2.00 1.50 1.00 1/100 200',
      '/proc/pressure/memory': 'some avg10=10.00 avg60=2.00 avg300=1.00 total=4',
      '/proc/pressure/cpu': 'some avg10=25.00 avg60=5.00 avg300=2.00 total=8',
    });
    const result = await checkMemoryCpu(ctx);
    expect(result.findings.map((item) => item.id)).toContain('memory-critical');
    expect(result.findings.map((item) => item.id)).toContain('memory-oom');
    expect(result.findings.map((item) => item.id)).toContain('cpu-pressure');
    expect(result.evidence.some((item) => item.output.includes('browser 80.0'))).toBe(true);
  });
});
