/**
 * Host network adapter inventory.
 *
 * Addresses/MACs come from os.networkInterfaces() (reflects the host only when
 * the container runs with host networking). Static-vs-DHCP is a best-effort
 * lookup via NetworkManager's `nmcli`, then systemd's `networkctl`; if neither
 * is reachable the assignment is reported as "unknown".
 */
import os from 'node:os';
import { execFile } from 'node:child_process';

export type Assignment = 'dhcp' | 'static' | 'link-local' | 'disabled' | 'unknown';

export interface AdapterAddress {
  family: 'IPv4' | 'IPv6';
  address: string;
  cidr: string | null;
}
export interface Adapter {
  name: string;
  mac: string | null;
  internal: boolean;
  type: string | null;
  connection: string | null;
  assignment: Assignment;
  addresses: AdapterAddress[];
}

function run(cmd: string, args: string[], timeout = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout) => resolve(err ? null : stdout));
  });
}

/** Split an `nmcli -t` line on unescaped ':' and unescape the fields. */
function splitTerse(line: string): string[] {
  return line
    .split(/(?<!\\):/)
    .map((f) => f.replace(/\\:/g, ':').replace(/\\\\/g, '\\'));
}

function methodToAssignment(method: string | undefined): Assignment | null {
  switch (method) {
    case 'auto':
      return 'dhcp';
    case 'manual':
      return 'static';
    case 'link-local':
      return 'link-local';
    case 'disabled':
      return 'disabled';
    default:
      return null;
  }
}

/** Map device name -> assignment via nmcli (NetworkManager). */
async function nmcliAssignments(): Promise<Record<string, { assignment: Assignment; type: string; connection: string }>> {
  const devicesOut = await run('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device']);
  if (!devicesOut) return {};
  const result: Record<string, { assignment: Assignment; type: string; connection: string }> = {};

  for (const line of devicesOut.split('\n').filter(Boolean)) {
    const [device, type, , connection] = splitTerse(line);
    if (!device) continue;
    let assignment: Assignment = 'unknown';
    if (connection && connection !== '--') {
      const m = await run('nmcli', ['-g', 'ipv4.method', 'connection', 'show', connection]);
      assignment = methodToAssignment(m?.trim()) ?? 'unknown';
    }
    result[device] = { assignment, type: type ?? '', connection: connection ?? '' };
  }
  return result;
}

/** Fallback: device -> 'dhcp' if systemd-networkd shows a DHCP lease. */
async function networkctlAssignments(): Promise<Record<string, Assignment>> {
  const out = await run('networkctl', ['--no-pager', '--no-legend', 'list']);
  if (!out) return {};
  const result: Record<string, Assignment> = {};
  for (const line of out.split('\n').filter(Boolean)) {
    const cols = line.trim().split(/\s+/);
    const name = cols[1];
    if (name) result[name] = 'unknown'; // presence only; method not exposed here
  }
  return result;
}

export async function listAdapters(): Promise<{ adapters: Adapter[]; detection: string }> {
  const ifaces = os.networkInterfaces();

  let assignments: Record<string, { assignment: Assignment; type: string; connection: string }> = await nmcliAssignments();
  let detection = Object.keys(assignments).length ? 'nmcli' : '';
  if (!detection) {
    const nc = await networkctlAssignments();
    if (Object.keys(nc).length) {
      detection = 'networkctl';
      assignments = Object.fromEntries(Object.entries(nc).map(([k, v]) => [k, { assignment: v, type: '', connection: '' }]));
    } else {
      detection = 'unavailable';
    }
  }

  const adapters: Adapter[] = Object.entries(ifaces).map(([name, addrs]) => {
    const list = addrs ?? [];
    const mac = list.find((a) => a.mac && a.mac !== '00:00:00:00:00:00')?.mac ?? null;
    const meta = assignments[name];
    return {
      name,
      mac,
      internal: list.some((a) => a.internal),
      type: meta?.type || null,
      connection: meta?.connection || null,
      assignment: meta?.assignment ?? 'unknown',
      addresses: list.map((a) => ({
        family: a.family === 'IPv4' ? ('IPv4' as const) : ('IPv6' as const),
        address: a.address,
        cidr: a.cidr ?? null,
      })),
    };
  });

  // Loopback/internal last; named with IPv4 first.
  adapters.sort((a, b) => Number(a.internal) - Number(b.internal) || a.name.localeCompare(b.name));
  return { adapters, detection };
}
