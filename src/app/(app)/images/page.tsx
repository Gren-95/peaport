'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Download, Trash2, Eraser } from 'lucide-react';
import { api, ApiClientError, getCsrfToken, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession, can } from '@/components/AppShell';
import { EmptyState, ErrorState, Modal, PageHeader, Spinner, bytes, timeAgo, useConfirm } from '@/components/ui';

interface ImageSummary {
  Id: string;
  RepoTags: string[] | null;
  Size: number;
  Created: number;
  Containers?: number;
}

export default function ImagesPage() {
  const { user } = useSession();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<{ images: ImageSummary[] }>('/api/images', swrFetcher, {
    refreshInterval: 10000,
  });
  const [pullOpen, setPullOpen] = useState(false);
  const [pruneOpen, setPruneOpen] = useState(false);

  async function removeImage(img: ImageSummary) {
    const tag = img.RepoTags?.[0] ?? img.Id.slice(7, 19);
    const ok = await confirm({ title: 'Remove image', message: `Remove image "${tag}"?`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      await api(`/api/images/${encodeURIComponent(img.Id)}?force=true`, { method: 'DELETE' });
      toast.success('Image removed');
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
        title="Images"
        subtitle="Local image store"
        actions={
          <>
            {isOperator && (
              <button className="btn-ghost" onClick={() => setPruneOpen(true)}>
                <Eraser size={15} /> Prune
              </button>
            )}
            {isOperator && (
              <button className="btn-primary" onClick={() => setPullOpen(true)}>
                <Download size={15} /> Pull image
              </button>
            )}
          </>
        }
      />
      {dialog}
      <PullDialog open={pullOpen} onClose={() => setPullOpen(false)} onDone={() => mutate()} />
      <PruneDialog open={pruneOpen} onClose={() => setPruneOpen(false)} onDone={() => mutate()} />

      {error ? (
        <ErrorState message={(error as Error).message} />
      ) : isLoading ? (
        <Spinner />
      ) : !data?.images.length ? (
        <EmptyState message="No images found." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-bg-soft">
              <tr>
                <th className="th">Repository : Tag</th>
                <th className="th">Image ID</th>
                <th className="th">Size</th>
                <th className="th">Created</th>
                {isAdmin && <th className="th text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.images.map((img) => (
                <tr key={img.Id} className="hover:bg-bg-hover/50">
                  <td className="td">
                    {img.RepoTags?.length ? (
                      img.RepoTags.map((t) => (
                        <div key={t} className="text-gray-100">
                          {t}
                        </div>
                      ))
                    ) : (
                      <span className="text-muted">&lt;none&gt;</span>
                    )}
                  </td>
                  <td className="td font-mono text-xs text-muted">{img.Id.replace('sha256:', '').slice(0, 12)}</td>
                  <td className="td">{bytes(img.Size)}</td>
                  <td className="td text-muted">{timeAgo(img.Created)}</td>
                  {isAdmin && (
                    <td className="td text-right">
                      <button className="btn-danger btn-xs" onClick={() => removeImage(img)}>
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

function PullDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [reference, setReference] = useState('');
  const [pulling, setPulling] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  async function pull() {
    if (!reference.trim()) return;
    setPulling(true);
    setLog([]);
    try {
      const res = await fetch('/api/images/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ reference: reference.trim() }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error?.message ?? `Pull failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';
        for (const ev of events) {
          const dataLines = ev
            .split('\n')
            .filter((l) => l.startsWith('data: '))
            .map((l) => l.slice(6));
          if (!dataLines.length) continue;
          const text = dataLines.join('');
          let line = text;
          try {
            const obj = JSON.parse(text);
            line = [obj.status, obj.id, obj.progress].filter(Boolean).join(' ');
            if (obj.error) line = `error: ${obj.error}`;
          } catch {
            /* keep raw */
          }
          setLog((prev) => [...prev.slice(-200), line]);
          requestAnimationFrame(() => {
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          });
        }
      }
      setLog((prev) => [...prev, '✓ pull complete']);
      onDone();
    } catch (err) {
      setLog((prev) => [...prev, `✗ ${err instanceof Error ? err.message : 'pull failed'}`]);
    } finally {
      setPulling(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={pulling ? () => {} : onClose}
      title="Pull image"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={pulling}>
            Close
          </button>
          <button className="btn-primary" onClick={pull} disabled={pulling || !reference.trim()}>
            {pulling ? <Spinner size={14} /> : <Download size={15} />} Pull
          </button>
        </>
      }
    >
      <label className="label">Image reference</label>
      <input
        className="input"
        placeholder="docker.io/library/nginx:latest"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        disabled={pulling}
      />
      {log.length > 0 && (
        <div ref={logRef} className="mt-3 h-48 overflow-auto rounded bg-[#0a0c11] p-2 font-mono text-xs text-gray-300">
          {log.map((l, i) => (
            <div key={i} className="break-all">
              {l}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

type PruneScope = 'dangling' | 'all';

function PruneDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [scope, setScope] = useState<PruneScope>('dangling');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (scope === 'all') params.set('all', 'true');
      if (until.trim()) params.set('until', until.trim());
      const res = await api<{ deleted: number; spaceReclaimed: number }>(
        `/api/images/prune?${params.toString()}`,
        { method: 'POST' },
      );
      toast.success(
        res.deleted > 0
          ? `Removed ${res.deleted} image${res.deleted === 1 ? '' : 's'}, reclaimed ${bytes(res.spaceReclaimed)}`
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
      title="Prune images"
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
            name="prune-scope"
            className="mt-1"
            checked={scope === 'dangling'}
            onChange={() => setScope('dangling')}
          />
          <span>
            <span className="block text-sm font-medium text-gray-100">Dangling images only</span>
            <span className="block text-xs text-muted">Untagged layers left over from rebuilds. Safe.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 hover:bg-bg-hover">
          <input
            type="radio"
            name="prune-scope"
            className="mt-1"
            checked={scope === 'all'}
            onChange={() => setScope('all')}
          />
          <span>
            <span className="block text-sm font-medium text-gray-100">All unused images</span>
            <span className="block text-xs text-muted">
              Every image not referenced by a container. They must be pulled/built again to reuse.
            </span>
          </span>
        </label>
      </fieldset>
      <label className="label mt-4">Only images older than (optional)</label>
      <input
        className="input"
        placeholder="e.g. 24h, 168h, or 2025-01-01T00:00:00"
        value={until}
        onChange={(e) => setUntil(e.target.value)}
        disabled={busy}
      />
    </Modal>
  );
}
