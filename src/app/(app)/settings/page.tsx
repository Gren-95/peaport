'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { KeyRound, Monitor, LogOut } from 'lucide-react';
import { api, ApiClientError, setCsrfToken, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession } from '@/components/AppShell';
import { PageHeader, Spinner, timeAgo, useConfirm } from '@/components/ui';

export default function SettingsPage() {
  const { user, engine } = useSession();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const data = await api<{ csrfToken: string }>('/api/account/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      setCsrfToken(data.csrfToken); // session was rotated
      toast.success('Password updated.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Settings" subtitle="Your account" />

      <div className="card mb-4 grid grid-cols-2 gap-4 p-5 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Username</div>
          <div className="mt-0.5 text-gray-200">{user.username}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Role</div>
          <div className="mt-0.5 text-gray-200">{user.role}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Engine</div>
          <div className="mt-0.5 text-gray-200">{engine}</div>
        </div>
      </div>

      <form onSubmit={changePassword} className="card space-y-4 p-5">
        <div className="flex items-center gap-2 text-gray-200">
          <KeyRound size={18} className="text-accent" />
          <h2 className="font-semibold">Change password</h2>
        </div>
        <div>
          <label className="label">Current password</label>
          <input
            type="password"
            className="input"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="min 8 characters"
            required
          />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={saving || next.length < 8}>
          {saving ? 'Saving…' : 'Update password'}
        </button>
      </form>

      <SessionsCard />
    </div>
  );
}

interface SessionInfo {
  createdAt: number;
  lastSeenAt: number;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

function SessionsCard() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading, mutate } = useSWR<{ sessions: SessionInfo[] }>('/api/account/sessions', swrFetcher);

  async function revokeOthers() {
    const ok = await confirm({
      title: 'Sign out other sessions',
      message: 'Revoke all sessions except this one? Other browsers/devices will be signed out.',
      confirmLabel: 'Sign out others',
    });
    if (!ok) return;
    try {
      const res = await api<{ revoked: number }>('/api/account/sessions', { method: 'DELETE' });
      toast.success(res.revoked > 0 ? `Revoked ${res.revoked} other session(s)` : 'No other sessions');
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to revoke sessions');
    }
  }

  const sessions = data?.sessions ?? [];
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="card mt-4 p-5">
      {dialog}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-200">
          <Monitor size={18} className="text-accent" />
          <h2 className="font-semibold">Active sessions</h2>
        </div>
        <button className="btn-ghost btn-xs" onClick={revokeOthers} disabled={others === 0}>
          <LogOut size={13} /> Sign out other sessions
        </button>
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {sessions.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-300">{s.ip ?? 'unknown'}</span>
                  {s.current && <span className="badge-ok">this session</span>}
                </div>
                <div className="truncate text-xs text-muted" title={s.userAgent ?? ''}>
                  {s.userAgent ?? 'unknown client'}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted">active {timeAgo(s.lastSeenAt / 1000)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
