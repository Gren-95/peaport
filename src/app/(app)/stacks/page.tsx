'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Layers, Plus, Upload } from 'lucide-react';
import { api, ApiClientError, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession, can } from '@/components/AppShell';
import { EmptyState, ErrorState, Modal, PageHeader, Spinner, stackStateBadge, timeAgo } from '@/components/ui';
import type { StackStatus } from '@/types';

const SAMPLE = `services:
  web:
    image: nginx:alpine
    ports:
      - "8088:80"
    restart: unless-stopped
`;

export default function StacksPage() {
  const { user } = useSession();
  const { data, error, isLoading, mutate } = useSWR<{ stacks: StackStatus[] }>('/api/stacks', swrFetcher, {
    refreshInterval: 5000,
  });
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Stacks"
        subtitle="Deploy and manage multi-container apps from Compose files"
        actions={
          can(user.role, 'operator') ? (
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> New stack
            </button>
          ) : undefined
        }
      />
      <CreateStackModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => mutate()} />

      {error ? (
        <ErrorState message={(error as Error).message} />
      ) : isLoading ? (
        <Spinner />
      ) : !data?.stacks.length ? (
        <EmptyState message="No stacks yet. Create one from a Compose file." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-bg-soft">
              <tr>
                <th className="th">Name</th>
                <th className="th">State</th>
                <th className="th">Services</th>
                <th className="th">Containers</th>
                <th className="th">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.stacks.map((s) => (
                <tr key={s.name} className="hover:bg-bg-hover/50">
                  <td className="td">
                    <Link href={`/stacks/${s.name}`} className="flex items-center gap-2 font-medium text-gray-100 hover:text-accent">
                      <Layers size={15} className="text-muted" />
                      {s.name}
                    </Link>
                  </td>
                  <td className="td">
                    <span className={stackStateBadge(s.state)}>{s.state}</span>
                  </td>
                  <td className="td text-muted">{s.services.length || '—'}</td>
                  <td className="td text-muted">
                    {s.total > 0 ? `${s.running} / ${s.total}` : '—'}
                  </td>
                  <td className="td text-muted">{timeAgo(s.updatedAt / 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateStackModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState('');
  const [content, setContent] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result ?? ''));
    reader.readAsText(file);
    if (!name) setName(file.name.replace(/\.(ya?ml)$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
  }

  async function create() {
    setBusy(true);
    try {
      await api('/api/stacks', { method: 'POST', body: { name: name.trim(), content } });
      toast.success('Stack created. Deploy it from its page.');
      onClose();
      onCreated();
      router.push(`/stacks/${name.trim()}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to create stack');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="New stack"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={create} disabled={busy || !name.trim() || !content.trim()}>
            {busy ? <Spinner size={14} /> : <Plus size={15} />} Create
          </button>
        </>
      }
    >
      <label className="label">Stack name</label>
      <input
        className="input"
        placeholder="my-app"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="mt-3 flex items-center justify-between">
        <label className="label mb-0">Compose file</label>
        <label className="btn-ghost btn-xs cursor-pointer">
          <Upload size={13} /> Upload
          <input type="file" accept=".yml,.yaml,text/yaml" className="hidden" onChange={onFile} />
        </label>
      </div>
      <textarea
        className="input mt-1 h-64 resize-y font-mono text-xs"
        spellCheck={false}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <p className="mt-2 text-xs text-muted">
        Reference secrets as <code>{'${SECRET_NAME}'}</code> — they are injected at deploy time, never stored in the
        file.
      </p>
    </Modal>
  );
}
