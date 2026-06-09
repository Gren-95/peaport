/**
 * Pure helpers that translate the friendly "run container" form into a
 * Docker/Podman create payload. Kept free of framework imports so it is unit
 * testable; the route maps SpecError to an HTTP 422.
 */

export class SpecError extends Error {}

export interface CreateContainerInput {
  image: string;
  name?: string;
  command?: string;
  env?: string[];
  ports?: string[];
  volumes?: string[];
  network?: string;
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  tty?: boolean;
  privileged?: boolean;
  autoRemove?: boolean;
  start?: boolean;
}

interface PortBinding {
  HostPort: string;
}

/** Parse "host:container[/proto]" or "container[/proto]" into an exposed key + host binding. */
export function parsePort(spec: string): { key: string; binding: PortBinding } {
  const trimmed = spec.trim();
  const [left, right] = trimmed.includes(':') ? trimmed.split(':') : [undefined, trimmed];
  const containerPart = (right ?? '').trim();
  if (!containerPart) throw new SpecError(`Invalid port mapping: "${spec}"`);
  const [port, proto = 'tcp'] = containerPart.split('/');
  if (!/^\d+$/.test(port ?? '')) throw new SpecError(`Invalid port: "${spec}"`);
  const hostPort = (left ?? port)!.trim();
  if (!/^\d+$/.test(hostPort)) throw new SpecError(`Invalid host port: "${spec}"`);
  return { key: `${port}/${proto}`, binding: { HostPort: hostPort } };
}

export function buildCreatePayload(body: CreateContainerInput): Record<string, unknown> {
  if (body.autoRemove && body.restartPolicy && body.restartPolicy !== 'no') {
    throw new SpecError('A restart policy cannot be combined with auto-remove.');
  }

  const exposedPorts: Record<string, object> = {};
  const portBindings: Record<string, PortBinding[]> = {};
  for (const spec of body.ports ?? []) {
    if (!spec) continue;
    const { key, binding } = parsePort(spec);
    exposedPorts[key] = {};
    (portBindings[key] ??= []).push(binding);
  }

  const binds = (body.volumes ?? []).filter((v) => v.includes(':'));
  const cmd = body.command?.trim() ? body.command.trim().split(/\s+/) : undefined;

  const hostConfig: Record<string, unknown> = {
    PortBindings: portBindings,
    Binds: binds.length ? binds : undefined,
    AutoRemove: body.autoRemove ?? false,
    Privileged: body.privileged ?? false,
  };
  if (body.network) hostConfig.NetworkMode = body.network;
  if (body.restartPolicy && body.restartPolicy !== 'no' && !body.autoRemove) {
    hostConfig.RestartPolicy = { Name: body.restartPolicy };
  }

  return {
    Image: body.image,
    Cmd: cmd,
    Env: body.env?.filter(Boolean),
    Tty: body.tty ?? false,
    ExposedPorts: Object.keys(exposedPorts).length ? exposedPorts : undefined,
    HostConfig: hostConfig,
  };
}
