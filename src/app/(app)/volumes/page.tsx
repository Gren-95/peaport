'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Trash2, Eraser } from 'lucide-react';
import { api, ApiClientError, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession, can } from '@/components/AppShell';
import { EmptyState, ErrorState, Modal, PageHeader, Spinner, useConfirm } from '@/components/ui';

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

  async function prune() {
    const ok = await confirm({ title: 'Prune volumes', message: 'Remove all unused volumes?', confirmLabel: 'Prune' });
    if (!ok) return;
    try {
      await api('/api/volumes/prune', { method: 'POST' });
      toast.success('Unused volumes pruned');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to prune');
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
              <button className="btn-ghost" onClick={prune}>
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
