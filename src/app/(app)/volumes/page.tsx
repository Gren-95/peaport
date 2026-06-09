'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Trash2, Eraser } from 'lucide-react';
import { api, ApiClientError, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession, can } from '@/components/AppShell';
import { EmptyState, ErrorState, Modal, PageHeader, Spinner, bytes, useConfirm } from '@/components/ui';

interface Volume {
  Name: string;
  Driver: string;
  Mountpoint: string;
  Scope?: string;
  CreatedAt?: string;
}

export default function VolumesPage() {
  const { user } = useSession();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<{ Volumes: Volume[] | null }>('/api/volumes', swrFetcher, {
    refreshInterval: 15000,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('local');

  async function create() {
    try {
      await api('/api/volumes', { method: 'POST', body: { name: name.trim(), driver: driver.trim() || undefined } });
      toast.success('Volume created');
      setCreateOpen(false);
      setName('');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to create');
    }
  }

  async function remove(v: Volume) {
    const ok = await confirm({ title: 'Remove volume', message: `Remove volume "${v.Name}"?`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      await api(`/api/volumes/${encodeURIComponent(v.Name)}?force=true`, { method: 'DELETE' });
      toast.success('Volume removed');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to remove');
    }
  }

  const isOperator = can(user.role, 'operator');
  const isAdmin = can(user.role, 'admin');
  const volumes = data?.Volumes ?? [];

  return (
    <div>
      <PageHeader
        title="Volumes"
        actions={
          <>
            {isOperator && (
              <button className="btn-ghost" onClick={() => setPruneOpen(true)}>
                <Eraser size={15} /> Prune
              </button>
            )}
            {isOperator && (
              <button className="btn-primary" onClick={() => setCreateOpen(true)}>
                <Plus size={15} /> Create
              </button>
            )}
          </>
        }
      />
      {dialog}
      <PruneVolumesDialog open={pruneOpen} onClose={() => setPruneOpen(false)} onDone={() => mutate()} />
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create volume"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={create} disabled={!name.trim()}>
              Create
            </button>
          </>
        }
      >
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-volume" />
        <label className="label mt-3">Driver</label>
        <input className="input" value={driver} onChange={(e) => setDriver(e.target.value)} />
      </Modal>

      {error ? (
        <ErrorState message={(error as Error).message} />
      ) : isLoading ? (
        <Spinner />
      ) : !volumes.length ? (
        <EmptyState message="No volumes found." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-bg-soft">
              <tr>
                <th className="th">Name</th>
                <th className="th">Driver</th>
                <th className="th">Mountpoint</th>
                {isAdmin && <th className="th text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {volumes.map((v) => (
                <tr key={v.Name} className="hover:bg-bg-hover/50">
                  <td className="td font-medium text-gray-100">{v.Name}</td>
                  <td className="td">{v.Driver}</td>
                  <td className="td font-mono text-xs text-muted">{v.Mountpoint}</td>
                  {isAdmin && (
                    <td className="td text-right">
                      <button className="btn-danger btn-xs" onClick={() => remove(v)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type VolumePruneScope = 'anonymous' | 'all';

function PruneVolumesDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [scope, setScope] = useState<VolumePruneScope>('anonymous');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (scope === 'all') params.set('all', 'true');
      if (label.trim()) params.set('label', label.trim());
      const res = await api<{ deleted: number; spaceReclaimed: number }>(
        `/api/volumes/prune?${params.toString()}`,
        { method: 'POST' },
      );
      toast.success(
        res.deleted > 0
          ? `Removed ${res.deleted} volume${res.deleted === 1 ? '' : 's'}, reclaimed ${bytes(res.spaceReclaimed)}`
          : 'Nothing to prune',
      );
      onClose();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to prune');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Prune volumes"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={scope === 'all' ? 'btn-danger' : 'btn-primary'} onClick={run} disabled={busy}>
            {busy ? <Spinner size={14} /> : <Eraser size={15} />} Prune
          </button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 hover:bg-bg-hover">
          <input
            type="radio"
            name="vol-prune-scope"
            className="mt-1"
            checked={scope === 'anonymous'}
            onChange={() => setScope('anonymous')}
          />
          <span>
            <span className="block text-sm font-medium text-gray-100">Anonymous unused volumes</span>
            <span className="block text-xs text-muted">Auto-generated volumes with no name, not attached to a container.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 hover:bg-bg-hover">
          <input
            type="radio"
            name="vol-prune-scope"
            className="mt-1"
            checked={scope === 'all'}
            onChange={() => setScope('all')}
          />
          <span>
            <span className="block text-sm font-medium text-gray-100">All unused volumes (incl. named)</span>
            <span className="block text-xs text-muted">
              Every volume not attached to a container. <strong className="text-warn">Deletes their data permanently.</strong>
            </span>
          </span>
        </label>
      </fieldset>
      <label className="label mt-4">Only volumes with label (optional)</label>
      <input
        className="input"
        placeholder="e.g. env=staging"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
      />
    </Modal>
  );
}
