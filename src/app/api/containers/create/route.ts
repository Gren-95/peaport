import { z } from 'zod';
import { ApiException, ok, parseBody, withAuth } from '@/lib/api';
import { containers } from '@/lib/resources';
import { createContainerSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateBody = z.infer<typeof createContainerSchema>;

interface PortBinding {
  HostPort: string;
}

/** Parse "host:container[/proto]" or "container[/proto]" into exposed/binding entries. */
function parsePort(spec: string): { key: string; binding: PortBinding } {
  const [left, right] = spec.includes(':') ? spec.split(':') : [undefined, spec];
  const containerPart = (right ?? '').trim();
  if (!containerPart) throw new ApiException('VALIDATION_ERROR', `Invalid port mapping: "${spec}"`, 422);
  const [port, proto = 'tcp'] = containerPart.split('/');
  if (!/^\d+$/.test(port!)) throw new ApiException('VALIDATION_ERROR', `Invalid port: "${spec}"`, 422);
  const hostPort = (left ?? port)!.trim();
  return { key: `${port}/${proto}`, binding: { HostPort: hostPort } };
}

function buildCreatePayload(body: CreateBody): Record<string, unknown> {
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
  if (body.restartPolicy && !body.autoRemove) hostConfig.RestartPolicy = { Name: body.restartPolicy };

  return {
    Image: body.image,
    Cmd: cmd,
    Env: body.env?.filter(Boolean),
    Tty: body.tty ?? false,
    ExposedPorts: Object.keys(exposedPorts).length ? exposedPorts : undefined,
    HostConfig: hostConfig,
  };
}

export const POST = withAuth(
  async ({ req }) => {
    const body = await parseBody<CreateBody>(req, createContainerSchema);
    if (body.autoRemove && body.restartPolicy && body.restartPolicy !== 'no') {
      throw new ApiException('VALIDATION_ERROR', 'A restart policy cannot be combined with auto-remove.', 422);
    }

    const payload = buildCreatePayload(body);
    const created = await containers.create(body.name || undefined, payload);

    let started = false;
    if (body.start) {
      await containers.action(created.Id, 'start');
      started = true;
    }
    return ok({ id: created.Id, started }, { status: 201 });
  },
  { role: 'operator' },
);
