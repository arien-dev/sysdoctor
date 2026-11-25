import { isIP } from 'node:net';

export interface RedactionOptions {
  username?: string;
  hostname?: string;
}

const ipv4Pattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const ipv6Pattern = /(?<![0-9a-f])(?:[0-9a-f]{0,4}:){2,}[0-9a-f:.]{0,39}(?![0-9a-f])/gi;
const macPattern = /\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi;
const uuidPattern = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLoopback(address: string): boolean {
  return address === '::1' || (isIP(address) === 4 && address.startsWith('127.'));
}

export function redactText(input: string, options: RedactionOptions = {}): string {
  const username = options.username;
  const hostname = options.hostname;
  let output = input;

  if (username) {
    output = output.replace(new RegExp(`/home/${escapeRegExp(username)}(?=/|\\b)`, 'g'), '/home/<user>');
    output = output.replace(new RegExp(`(?<![\\w.-])${escapeRegExp(username)}(?![\\w.-])`, 'g'), '<user>');
  }
  if (hostname) {
    output = output.replace(new RegExp(`(?<![\\w.-])${escapeRegExp(hostname)}(?![\\w.-])`, 'gi'), '<host>');
  }
  output = output.replace(ipv4Pattern, (address) =>
    isIP(address) === 4 && !isLoopback(address) ? '<ip>' : address);
  output = output.replace(ipv6Pattern, (address) =>
    isIP(address) === 6 && !isLoopback(address) ? '<ip>' : address);
  output = output.replace(macPattern, '<mac>');
  output = output.replace(uuidPattern, '<uuid>');
  return output;
}
