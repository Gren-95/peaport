'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Play, Square, RotateCw, Trash2, Pause, Terminal, Plus } from 'lucide-react';
import { api, ApiClientError, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession, can } from '@/components/AppShell';
import { EmptyState, ErrorState, Modal, PageHeader, Spinner, stateBadge, useConfirm } from '@/components/ui';
import type { ContainerSummary } from '@/types';

function shortName(c: ContainerSummary): string {
  return c.Names?.[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12);
}

function ports(c: ContainerSummary): string {
  if (!c.Ports?.length) return '—';
  const seen = new Set<string>();
  for (const p of c.Ports) {
    if (p.PublicPort) seen.add(`${p.PublicPort}→${p.PrivatePort}/${p.Type ?? 'tcp'}`);
    else if (p.PrivatePort) seen.add(`${p.PrivatePort}/${p.Type ?? 'tcp'}`);
  }
  return [...seen].join(', ') || '—';
}

export default function ContainersPage() {
  const { user } = useSession();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<{ containers: ContainerSummary[] }>(
    '/api/containers',
    swrFetcher,
    { refreshInterval: 5000 },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);

  async function act(id: string, action: string) {
    setBusy(`${id}:${action}`);
    try {
      await api(`/api/containers/${id}/${action}`, { method: 'POST' });
      toast.success(`Container ${action} succeeded`);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(c: ContainerSummary) {
    const ok = await confirm({
      title: 'Remove container',
      message: `Remove "${shortName(c)}"? ${c.State === 'running' ? 'It is running and will be force-removed.' : ''}`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setBusy(`${c.Id}:rm`);
    try {
      await api(`/api/containers/${c.Id}?force=${c.State === 'running'}`, { method: 'DELETE' });
      toast.success('Container removed');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to remove');
    } finally {
      setBusy(null);
    }
  }

  const isOperator = can(user.role, 'operator');
  const isAdmin = can(user.role, 'admin');

  return (
    <div>
      <PageHeader
        title="Containers"
        subtitle="Manage container lifecycle"
        actions={
          isOperator ? (
            <button className="btn-primary" onClick={() => setRunOpen(true)}>
              <Plus size={15} /> Run container
            </button>
          ) : undefined
        }
      />
      {dialog}
      <RunContainerModal open={runOpen} onClose={() => setRunOpen(false)} onDone={() => mutate()} />

      {error ? (
        <ErrorState message={(error as ApiClientError).message ?? 'Failed to load containers.'} />
      ) : isLoading ? (
        <Spinner />
      ) : !data?.containers.length ? (
        <EmptyState message="No containers found." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-bg-soft">
              <tr>
                <th className="th">Name</th>
                <th className="th">State</th>
                <th className="th">Image</th>
                <th className="th">Ports</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.containers.map((c) => {
                const running = c.State === 'running';
                const paused = c.State === 'paused';
                return (
                  <tr key={c.Id} className="hover:bg-bg-hover/50">
                    <td className="td">
                      <Link href={`/containers/${c.Id}`} className="font-medium text-gray-100 hover:text-accent">
                        {shortName(c)}
                      </Link>
                      <div className="text-xs text-muted">{c.Id.slice(0, 12)}</div>
                    </td>
                    <td className="td">
                      <span className={stateBadge(c.State)}>{c.State}</span>
                    </td>
                    <td className="td max-w-[16rem] truncate" title={c.Image}>
                      {c.Image}
                    </td>
                    <td className="td font-mono text-xs">{ports(c)}</td>
                    <td className="td text-xs text-muted">{c.Status}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        {isOperator && running && (
                          <>
                            <IconBtn title="Stop" onClick={() => act(c.Id, 'stop')} busy={busy === `${c.Id}:stop`}>
                              <Square size={15} />
                            </IconBtn>
                            <IconBtn title="Restart" onClick={() => act(c.Id, 'restart')} busy={busy === `${c.Id}:restart`}>
                              <RotateCw size={15} />
                            </IconBtn>
                            <IconBtn title="Pause" onClick={() => act(c.Id, 'pause')} busy={busy === `${c.Id}:pause`}>
                              <Pause size={15} />
                            </IconBtn>
                          </>
                        )}
                        {isOperator && paused && (
                          <IconBtn title="Unpause" onClick={() => act(c.Id, 'unpause')} busy={busy === `${c.Id}:unpause`}>
                            <Play size={15} />
                          </IconBtn>
                        )}
                        {isOperator && !running && !paused && (
                          <IconBtn title="Start" onClick={() => act(c.Id, 'start')} busy={busy === `${c.Id}:start`}>
                            <Play size={15} />
                          </IconBtn>
                        )}
                        <Link href={`/containers/${c.Id}?tab=exec`} className="btn-ghost btn-xs" title="Exec">
                          <Terminal size={15} />
                        </Link>
                        {isAdmin && (
                          <button
                            className="btn-danger btn-xs"
                            title="Remove"
                            onClick={() => remove(c)}
                            disabled={busy === `${c.Id}:rm`}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  busy,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button className="btn-ghost btn-xs" title={title} onClick={onClick} disabled={busy}>
      {busy ? <Spinner size={14} /> : children}
    </button>
  );
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function RunContainerModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [env, setEnv] = useState('');
  const [ports, setPorts] = useState('');
  const [volumes, setVolumes] = useState('');
  const [network, setNetwork] = useState('');
  const [restartPolicy, setRestartPolicy] = useState('no');
  const [tty, setTty] = useState(false);
  const [privileged, setPrivileged] = useState(false);
  const [autoRemove, setAutoRemove] = useState(false);
  const [start, setStart] = useState(true);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await api<{ id: string; started: boolean }>('/api/containers/create', {
        method: 'POST',
        body: {
          image: image.trim(),
          name: name.trim() || undefined,
          command: command.trim() || undefined,
          env: lines(env),
          ports: lines(ports),
          volumes: lines(volumes),
          network: network.trim() || undefined,
          restartPolicy,
          tty,
          privileged,
          autoRemove,
          start,
        },
      });
      toast.success(res.started ? 'Container created and started' : 'Container created');
      onClose();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to create container');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Run a container"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={create} disabled={busy || !image.trim()}>
            {busy ? <Spinner size={14} /> : <Play size={15} />} {start ? 'Create & start' : 'Create'}
          </button>
        </>
      }
    >
      <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Image *</label>
            <input className="input" placeholder="nginx:alpine" value={image} onChange={(e) => setImage(e.target.value)} />
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" placeholder="optional" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Command (override)</label>
          <input className="input font-mono" placeholder="leave blank for image default" value={command} onChange={(e) => setCommand(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Ports (one per line)</label>
            <textarea className="input h-20 resize-y font-mono text-xs" placeholder={'8080:80\n5432:5432/tcp'} value={ports} onChange={(e) => setPorts(e.target.value)} />
          </div>
          <div>
            <label className="label">Volumes (one per line)</label>
            <textarea className="input h-20 resize-y font-mono text-xs" placeholder={'mydata:/data\n/host/path:/app:ro'} value={volumes} onChange={(e) => setVolumes(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Environment (KEY=VALUE per line)</label>
          <textarea className="input h-20 resize-y font-mono text-xs" placeholder={'TZ=UTC\nDB_PASSWORD=${DB_PASSWORD}'} value={env} onChange={(e) => setEnv(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Network</label>
            <input className="input" placeholder="bridge (default)" value={network} onChange={(e) => setNetwork(e.target.value)} />
          </div>
          <div>
            <label className="label">Restart policy</label>
            <select className="input" value={restartPolicy} onChange={(e) => setRestartPolicy(e.target.value)} disabled={autoRemove}>
              <option value="no">no</option>
              <option value="on-failure">on-failure</option>
              <option value="unless-stopped">unless-stopped</option>
              <option value="always">always</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-1 text-sm text-gray-300">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={start} onChange={(e) => setStart(e.target.checked)} /> start now
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={tty} onChange={(e) => setTty(e.target.checked)} /> tty
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={autoRemove} onChange={(e) => setAutoRemove(e.target.checked)} /> auto-remove
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={privileged} onChange={(e) => setPrivileged(e.target.checked)} /> privileged
          </label>
        </div>
      </div>
    </Modal>
  );
}
