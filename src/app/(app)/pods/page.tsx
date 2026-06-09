'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Play, Square, RotateCw, Trash2 } from 'lucide-react';
import { api, ApiClientError, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession, can } from '@/components/AppShell';
import { EmptyState, ErrorState, PageHeader, Spinner, useConfirm } from '@/components/ui';

interface Pod {
  Id: string;
  Name: string;
  Status: string;
  Created?: string;
  Containers?: Array<{ Id: string; Names?: string; Status?: string }>;
}

function podBadge(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('running')) return 'badge-ok';
  if (s.includes('paused') || s.includes('degraded')) return 'badge-warn';
  if (s.includes('exited') || s.includes('dead')) return 'badge-danger';
  return 'badge-muted';
}

export default function PodsPage() {
  const { user } = useSession();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<{ supported: boolean; pods: Pod[] }>('/api/pods', swrFetcher, {
    refreshInterval: 8000,
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, action: string) {
    setBusy(`${id}:${action}`);
    try {
      await api(`/api/pods/${id}/${action}`, { method: 'POST' });
      toast.success(`Pod ${action} succeeded`);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: Pod) {
    const ok = await confirm({ title: 'Remove pod', message: `Remove pod "${p.Name}" and its containers?`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    setBusy(`${p.Id}:rm`);
    try {
      await api(`/api/pods/${p.Id}?force=true`, { method: 'DELETE' });
      toast.success('Pod removed');
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
      <PageHeader title="Pods" subtitle="Groups of containers sharing namespaces (Podman)" />
      {dialog}

      {error ? (
        <ErrorState message={(error as Error).message} />
      ) : isLoading ? (
        <Spinner />
      ) : data && !data.supported ? (
        <EmptyState message="Pods are a Podman feature. The connected engine does not expose the libpod API." />
      ) : !data?.pods.length ? (
        <EmptyState message="No pods found." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-bg-soft">
              <tr>
                <th className="th">Name</th>
                <th className="th">Status</th>
                <th className="th">Containers</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.pods.map((p) => (
                <tr key={p.Id} className="hover:bg-bg-hover/50">
                  <td className="td">
                    <div className="font-medium text-gray-100">{p.Name}</div>
                    <div className="text-xs text-muted">{p.Id.slice(0, 12)}</div>
                  </td>
                  <td className="td">
                    <span className={podBadge(p.Status)}>{p.Status}</span>
                  </td>
                  <td className="td text-muted">{p.Containers?.length ?? 0}</td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1">
                      {isOperator && (
                        <>
                          <button className="btn-ghost btn-xs" title="Start" onClick={() => act(p.Id, 'start')} disabled={busy === `${p.Id}:start`}>
                            <Play size={15} />
                          </button>
                          <button className="btn-ghost btn-xs" title="Stop" onClick={() => act(p.Id, 'stop')} disabled={busy === `${p.Id}:stop`}>
                            <Square size={15} />
                          </button>
                          <button className="btn-ghost btn-xs" title="Restart" onClick={() => act(p.Id, 'restart')} disabled={busy === `${p.Id}:restart`}>
                            <RotateCw size={15} />
                          </button>
                        </>
                      )}
                      {isAdmin && (
                        <button className="btn-danger btn-xs" title="Remove" onClick={() => remove(p)} disabled={busy === `${p.Id}:rm`}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
