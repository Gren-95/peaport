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

  async function prune() {
    const ok = await confirm({ title: 'Prune networks', message: 'Remove all unused networks?', confirmLabel: 'Prune' });
    if (!ok) return;
    try {
      await api('/api/networks/prune', { method: 'POST' });
      toast.success('Unused networks pruned');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to prune');
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
