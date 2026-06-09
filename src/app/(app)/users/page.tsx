'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Plus, Trash2, KeyRound, ShieldCheck } from 'lucide-react';
import { api, ApiClientError, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession } from '@/components/AppShell';
import { EmptyState, ErrorState, Modal, PageHeader, Spinner, timeAgo, useConfirm } from '@/components/ui';
import { ROLES, type Role, type User } from '@/types';

export default function UsersPage() {
  const { user: me } = useSession();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<{ users: User[] }>('/api/users', swrFetcher);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  if (me.role !== 'admin') {
    return (
      <div>
        <PageHeader title="Users" />
        <ErrorState message="User management requires the admin role." />
      </div>
    );
  }

  async function remove(u: User) {
    const ok = await confirm({ title: 'Delete user', message: `Delete user "${u.username}"?`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api(`/api/users/${u.id}`, { method: 'DELETE' });
      toast.success('User deleted');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete');
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Accounts and role-based access"
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> New user
          </button>
        }
      />
      {dialog}
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={mutate} />
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} onDone={mutate} />

      {error ? (
        <ErrorState message={(error as Error).message} />
      ) : isLoading ? (
        <Spinner />
      ) : !data?.users.length ? (
        <EmptyState message="No users." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-bg-soft">
              <tr>
                <th className="th">Username</th>
                <th className="th">Role</th>
                <th className="th">Last login</th>
                <th className="th">Created</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.users.map((u) => (
                <tr key={u.id} className="hover:bg-bg-hover/50">
                  <td className="td font-medium text-gray-100">
                    {u.username}
                    {u.id === me.id && <span className="badge-muted ml-2">you</span>}
                  </td>
                  <td className="td">
                    <span className="inline-flex items-center gap-1 text-gray-300">
                      <ShieldCheck size={14} className="text-muted" />
                      {u.role}
                    </span>
                  </td>
                  <td className="td text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt / 1000) : 'never'}</td>
                  <td className="td text-muted">{timeAgo(u.createdAt / 1000)}</td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost btn-xs" title="Edit" onClick={() => setEditUser(u)}>
                        <KeyRound size={14} />
                      </button>
                      <button
                        className="btn-danger btn-xs"
                        title="Delete"
                        onClick={() => remove(u)}
                        disabled={u.id === me.id}
                      >
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

function CreateUserModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');

  async function submit() {
    try {
      await api('/api/users', { method: 'POST', body: { username: username.trim(), password, role } });
      toast.success('User created');
      setUsername('');
      setPassword('');
      setRole('viewer');
      onClose();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to create user');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create user"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={!username.trim() || password.length < 8}>
            Create
          </button>
        </>
      }
    >
      <label className="label">Username</label>
      <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
      <label className="label mt-3">Password</label>
      <input
        type="password"
        className="input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="min 8 characters"
      />
      <label className="label mt-3">Role</label>
      <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onDone }: { user: User | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [role, setRole] = useState<Role>('viewer');
  const [password, setPassword] = useState('');

  // Initialise local state whenever a different user is opened for editing.
  useEffect(() => {
    if (user) {
      setRole(user.role);
      setPassword('');
    }
  }, [user]);

  async function submit() {
    if (!user) return;
    const body: { role?: Role; password?: string } = {};
    if (role !== user.role) body.role = role;
    if (password) body.password = password;
    if (!body.role && !body.password) {
      onClose();
      return;
    }
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body });
      toast.success('User updated');
      setPassword('');
      onClose();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to update');
    }
  }

  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={user ? `Edit ${user.username}` : 'Edit user'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Save
          </button>
        </>
      }
    >
      {user && (
        <div key={user.id}>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <label className="label mt-3">Reset password (optional)</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="leave blank to keep current"
          />
          <p className="mt-2 text-xs text-muted">Changing the password signs the user out of all sessions.</p>
        </div>
      )}
    </Modal>
  );
}
