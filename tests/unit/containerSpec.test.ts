import { describe, expect, it } from 'bun:test';
import { buildCreatePayload, parsePort, SpecError } from '@/lib/containerSpec';

describe('parsePort', () => {
  it('parses host:container', () => {
    expect(parsePort('8080:80')).toEqual({ key: '80/tcp', binding: { HostPort: '8080' } });
  });
  it('defaults the host port to the container port when only one is given', () => {
    expect(parsePort('80')).toEqual({ key: '80/tcp', binding: { HostPort: '80' } });
  });
  it('honours an explicit protocol', () => {
    expect(parsePort('5353:53/udp')).toEqual({ key: '53/udp', binding: { HostPort: '5353' } });
  });
  it('rejects non-numeric ports', () => {
    expect(() => parsePort('abc')).toThrow(SpecError);
    expect(() => parsePort('8080:')).toThrow(SpecError);
    expect(() => parsePort('x:80')).toThrow(SpecError);
  });
});

describe('buildCreatePayload', () => {
  it('builds a minimal payload from an image only', () => {
    const p = buildCreatePayload({ image: 'nginx:alpine' }) as any;
    expect(p.Image).toBe('nginx:alpine');
    expect(p.Tty).toBe(false);
    expect(p.ExposedPorts).toBeUndefined();
    expect(p.HostConfig.AutoRemove).toBe(false);
    expect(p.HostConfig.RestartPolicy).toBeUndefined();
  });

  it('maps ports to ExposedPorts and PortBindings', () => {
    const p = buildCreatePayload({ image: 'redis', ports: ['16379:6379'] }) as any;
    expect(p.ExposedPorts).toEqual({ '6379/tcp': {} });
    expect(p.HostConfig.PortBindings).toEqual({ '6379/tcp': [{ HostPort: '16379' }] });
  });

  it('keeps only valid volume binds and splits the command', () => {
    const p = buildCreatePayload({
      image: 'busybox',
      volumes: ['data:/data', 'no-colon-dropped', '/host:/app:ro'],
      command: 'sh -c "sleep 1"',
      env: ['A=1', ''],
    }) as any;
    expect(p.HostConfig.Binds).toEqual(['data:/data', '/host:/app:ro']);
    expect(p.Cmd).toEqual(['sh', '-c', '"sleep', '1"']);
    expect(p.Env).toEqual(['A=1']);
  });

  it('sets a restart policy', () => {
    const p = buildCreatePayload({ image: 'x', restartPolicy: 'always' }) as any;
    expect(p.HostConfig.RestartPolicy).toEqual({ Name: 'always' });
  });

  it('rejects restart policy combined with auto-remove', () => {
    expect(() => buildCreatePayload({ image: 'x', restartPolicy: 'always', autoRemove: true })).toThrow(SpecError);
  });
});
