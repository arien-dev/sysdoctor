export type Severity = 'ok' | 'info' | 'warn' | 'error';
export type Risk = 'read-only' | 'reversible' | 'caution';

export interface Evidence {
  source: string;
  output: string;
}

export interface ActionStep {
  risk: Risk;
  text: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  component: string;
  title: string;
  cause: string;
  evidence: string[];
  steps: ActionStep[];
}

export interface SubsystemResult {
  id: SubsystemId;
  label: string;
  status: Severity;
  metrics: string[];
  findings: Finding[];
  evidence: Evidence[];
  scannedAt: string;
}

export interface CommandResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  code: number | null;
  error?: 'missing-command' | 'permission-denied' | 'timeout' | 'failed';
}

export interface ProbeContext {
  run(command: string, args?: string[]): Promise<CommandResult>;
  read(path: string): Promise<string | null>;
  env(name: string): string | undefined;
  now(): Date;
}

export type SubsystemId =
  | 'services'
  | 'audio'
  | 'bluetooth'
  | 'network'
  | 'storage'
  | 'suspend'
  | 'gpu-display'
  | 'memory-cpu';

export interface SystemReport {
  version: string;
  hostname: string;
  kernel: string;
  distro: string;
  generatedAt: string;
  system: {
    cpuCount: number;
    loadAverage: [number, number, number];
    uptimeSeconds: number;
    memoryTotalBytes: number;
    memoryAvailableBytes: number;
    memoryUsedPercent: number;
  };
  results: SubsystemResult[];
}
