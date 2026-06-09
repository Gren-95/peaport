'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { KeyRound, Plus, Trash2, Pencil } from 'lucide-react';
import { api, ApiClientError, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession, can } from '@/components/AppShell';
import { EmptyState, ErrorState, Modal, PageHeader, Spinner, timeAgo, useConfirm } from '@/components/ui';

interface SecretMeta {
  name: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  hint: string;
}

export default function SecretsPage() {
  const { user } = useSession();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<{ secrets: SecretMeta[] }>('/api/secrets', swrFetcher);
  const [editing, setEditing] = useState<{ name: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (!can(user.role, 'operator')) {
    return (
      <div>
        <PageHeader title="Secrets" />
        <ErrorState message="Secrets management requires the operator role or higher." />
      </div>
    );
  }

  async function remove(name: string) {
    const ok = await confirm({ title: 'Delete secret', message: `Delete secret "${name}"?`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api(`/api/secrets/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast.success('Secret deleted');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete');
    }
  }

  return (
    <div>
      <PageHeader
        title="Secrets"
        subtitle="Encrypted values injected into stack deploys — never shown after saving"
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> New secret
          </button>
        }
      />
      {dialog}
      <SecretModal
        open={createOpen || editing !== null}
        editName={editing?.name}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onDone={mutate}
      />

      <div className="mb-4 rounded-lg border border-border bg-bg-soft px-4 py-3 text-sm text-muted">
        Reference a secret in any stack&apos;s compose file as <code className="text-gray-200">{'${NAME}'}</code>. Values
        are AES-256-GCM encrypted at rest and decrypted only on the server at deploy time. They cannot be read back
        through the UI by anyone — including you.
      </div>

      {error ? (
        <ErrorState message={(error as Error).message} />
      ) : isLoading ? (
        <Spinner />
      ) : !data?.secrets.length ? (
        <EmptyState message="No secrets yet." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-bg-soft">
              <tr>
                <th className="th">Name</th>
                <th className="th">Value</th>
                <th className="th">Created by</th>
                <th className="th">Updated</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.secrets.map((s) => (
                <tr key={s.name} className="hover:bg-bg-hover/50">
                  <td className="td">
                    <span className="flex items-center gap-2 font-mono font-medium text-gray-100">
                      <KeyRound size={14} className="text-muted" />
                      {s.name}
                    </span>
                  </td>
                  <td className="td font-mono text-muted">••••••{s.hint.replace('••', '')}</td>
                  <td className="td text-muted">{s.createdBy ?? '—'}</td>
                  <td className="td text-muted">{timeAgo(s.updatedAt / 1000)}</td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost btn-xs" title="Update value" onClick={() => setEditing({ name: s.name })}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn-danger btn-xs" title="Delete" onClick={() => remove(s.name)}>
                        <Trash2 size={14} />
                      </button>
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

function SecretModal({
  open,
  editName,
  onClose,
  onDone,
}: {
  open: boolean;
  editName?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset fields when the dialog opens for a (different) secret.
  const [openedFor, setOpenedFor] = useState<string | undefined>(undefined);
  if (open && openedFor !== (editName ?? '__new__')) {
    setOpenedFor(editName ?? '__new__');
    setName(editName ?? '');
    setValue('');
  }

  async function submit() {
    setBusy(true);
    try {
      await api('/api/secrets', { method: 'POST', body: { name: name.trim(), value } });
      toast.success(editName ? 'Secret updated' : 'Secret saved');
      onClose();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to save secret');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={editName ? `Update ${editName}` : 'New secret'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || !name.trim() || !value}>
            {busy ? <Spinner size={14} /> : null} Save
          </button>
        </>
      }
    >
      <label className="label">Name</label>
      <input
        className="input font-mono"
        placeholder="DB_PASSWORD"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={Boolean(editName)}
      />
      <label className="label mt-3">Value</label>
      <textarea
        className="input h-24 resize-y font-mono text-xs"
        placeholder="paste the secret value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
      />
      <p className="mt-2 text-xs text-muted">Stored encrypted. You will not be able to view this value again.</p>
    </Modal>
  );
}
