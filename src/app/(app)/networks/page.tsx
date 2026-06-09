'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Trash2, Eraser } from 'lucide-react';
import { api, ApiClientError, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession, can } from '@/components/AppShell';
import { EmptyState, ErrorState, Modal, PageHeader, Spinner, useConfirm } from '@/components/ui';

interface NetworkSummary {
  Name: string;
  Id: string;
  Driver: string;
  Scope?: string;
  Internal?: boolean;
  IPAM?: { Config?: Array<{ Subnet?: string }> };
}

export default function NetworksPage() {
  const { user } = useSession();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<{ networks: NetworkSummary[] }>('/api/networks', swrFetcher, {
    refreshInterval: 15000,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('bridge');
  const [internal, setInternal] = useState(false);

  async function create() {
    try {
      await api('/api/networks', {
        method: 'POST',
        body: { name: name.trim(), driver: driver.trim() || undefined, internal },
      });
      toast.success('Network created');
      setCreateOpen(false);
      setName('');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to create');
    }
  }

  async function remove(n: NetworkSummary) {
    const ok = await confirm({ title: 'Remove network', message: `Remove network "${n.Name}"?`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      await api(`/api/networks/${encodeURIComponent(n.Id || n.Name)}`, { method: 'DELETE' });
      toast.success('Network removed');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to remove');
    }
  }

  const isOperator = can(user.role, 'operator');
  const isAdmin = can(user.role, 'admin');

  return (
    <div>
      <PageHeader
        title="Networks"
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
      <PruneNetworksDialog open={pruneOpen} onClose={() => setPruneOpen(false)} onDone={() => mutate()} />
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create network"
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
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-network" />
        <label className="label mt-3">Driver</label>
        <input className="input" value={driver} onChange={(e) => setDriver(e.target.value)} />
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          Internal (no external routing)
        </label>
      </Modal>

      {error ? (
        <ErrorState message={(error as Error).message} />
      ) : isLoading ? (
        <Spinner />
      ) : !data?.networks.length ? (
        <EmptyState message="No networks found." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-bg-soft">
              <tr>
                <th className="th">Name</th>
                <th className="th">Driver</th>
                <th className="th">Subnet</th>
                <th className="th">Scope</th>
                {isAdmin && <th className="th text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.networks.map((n) => (
                <tr key={n.Id || n.Name} className="hover:bg-bg-hover/50">
                  <td className="td font-medium text-gray-100">
                    {n.Name}
                    {n.Internal && <span className="badge-muted ml-2">internal</span>}
                  </td>
                  <td className="td">{n.Driver}</td>
                  <td className="td font-mono text-xs text-muted">
                    {n.IPAM?.Config?.map((c) => c.Subnet).filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="td text-muted">{n.Scope ?? '—'}</td>
                  {isAdmin && (
                    <td className="td text-right">
                      <button className="btn-danger btn-xs" onClick={() => remove(n)}>
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

function PruneNetworksDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [until, setUntil] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (until.trim()) params.set('until', until.trim());
      if (label.trim()) params.set('label', label.trim());
      const qs = params.toString();
      const res = await api<{ deleted: number }>(`/api/networks/prune${qs ? `?${qs}` : ''}`, { method: 'POST' });
      toast.success(
        res.deleted > 0 ? `Removed ${res.deleted} network${res.deleted === 1 ? '' : 's'}` : 'Nothing to prune',
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
      title="Prune networks"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={run} disabled={busy}>
            {busy ? <Spinner size={14} /> : <Eraser size={15} />} Prune
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-300">
        Removes all networks not attached to any container (built-in networks like <code>bridge</code>,{' '}
        <code>host</code> and <code>none</code> are never removed).
      </p>
      <label className="label mt-4">Only networks older than (optional)</label>
      <input
        className="input"
        placeholder="e.g. 24h, 168h, or 2025-01-01T00:00:00"
        value={until}
        onChange={(e) => setUntil(e.target.value)}
        disabled={busy}
      />
      <label className="label mt-3">Only networks with label (optional)</label>
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
