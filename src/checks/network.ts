import type { Evidence, Finding, ProbeContext, SubsystemResult } from '../types.js';
import { addCommandEvidence, addFileEvidence, finding, result } from './common.js';

export async function checkNetwork(ctx: ProbeContext): Promise<SubsystemResult> {
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const [addresses, routes, dns, resolv, journal] = await Promise.all([
    ctx.run('ip', ['-br', 'addr']),
    ctx.run('ip', ['route']),
    ctx.run('resolvectl', ['status']),
    ctx.read('/etc/resolv.conf'),
    ctx.run('journalctl', ['-b', '-n', '300', '--no-pager', '--output=short-iso']),
  ]);
  const addressText = addCommandEvidence(evidence, addresses);
  const routeText = addCommandEvidence(evidence, routes);
  const dnsText = addCommandEvidence(evidence, dns);
  const resolvText = addFileEvidence(evidence, '/etc/resolv.conf', resolv);
  const journalText = addCommandEvidence(evidence, journal);
  const interfaces = addressText.split('\n').filter(Boolean);
  const down = interfaces.filter((line) => /\bDOWN\b/.test(line) && !/^lo\b/.test(line));
  const hasDefault = /^default\s/m.test(routeText);
  if (routes.code !== 0) {
    findings.push(finding('network-ip-missing', 'info', 'network tools', 'Interface and route query unavailable',
      routes.error === 'missing-command'
        ? 'Interface and routing checks could not run because iproute2 is not installed.'
        : 'Interface and routing checks could not complete because the ip route probe failed.',
      [addressText, routeText], [{ risk: 'read-only', text: 'Install or use the distribution package that provides iproute2 to inspect routes.' }]));
  } else if (!hasDefault) {
    findings.push(finding('network-no-gateway', 'warn', 'routing', 'No default route detected',
      'Without a default route, traffic to destinations outside connected networks cannot reach a gateway.',
      [routeText], [{ risk: 'read-only', text: 'Inspect ip -br addr and your network manager for a missing or disconnected gateway.' }]));
  }
  if (down.length) findings.push(finding('network-down-interfaces', 'warn', 'interfaces',
    `${down.length} non-loopback interface(s) down`,
    'A disconnected or administratively down interface can explain loss of network access.',
    down, [{ risk: 'read-only', text: 'Check physical/Wi-Fi link state and the network manager connection status.' }]));
  if (/command not installed/.test(dnsText)) {
    findings.push(finding('network-resolvectl-missing', 'info', 'DNS', 'resolvectl is unavailable',
      'This host may not use systemd-resolved; /etc/resolv.conf is used as a fallback indicator.',
      [dnsText, resolvText], [{ risk: 'read-only', text: 'Check the nameserver entries and the active network manager DNS configuration.' }]));
  } else if (!/DNS Servers?:/i.test(dnsText) && !/nameserver\s+\S+/.test(resolvText)) {
    findings.push(finding('network-no-dns', 'warn', 'DNS', 'No DNS server configured',
      'No resolver address was visible in systemd-resolved status or resolv.conf.',
      [dnsText, resolvText], [{ risk: 'read-only', text: 'Inspect the active connection profile and resolver configuration.' }]));
  }
  const netErrors = journalText.split('\n').filter((line) =>
    /networkmanager|systemd-networkd|resolved|dhcp/i.test(line) && /error|failed|timeout|no lease/i.test(line));
  if (netErrors.length) findings.push(finding('network-journal-errors', 'warn', 'network services',
    'Recent network service errors', 'Network configuration, DHCP, or DNS services have reported recent failures.',
    netErrors.slice(-10), [{ risk: 'read-only', text: 'Review the relevant network manager logs and current lease/configuration.' }]));
  if (findings.length === 0) findings.push(finding('network-healthy', 'ok', 'network',
    'Network configuration looks present', 'A default route and resolver configuration were detected without matching service errors.',
    [addressText, routeText, dnsText].filter(Boolean), []));
  return result('network', 'network', findings, evidence,
    [`${interfaces.length} interfaces`, hasDefault ? 'default route present' : 'no default route'], ctx.now());
}
