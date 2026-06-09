'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { api, ApiClientError, setCsrfToken } from '@/lib/client';
import type { SessionUser } from '@/types';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pull a fresh CSRF token (and confirm the session) on load.
  useEffect(() => {
    api<{ user: SessionUser; csrfToken: string }>('/api/auth/me')
      .then((data) => {
        setCsrfToken(data.csrfToken);
        if (!data.user.mustChangePassword) router.replace('/dashboard');
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const data = await api<{ csrfToken: string }>('/api/account/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      setCsrfToken(data.csrfToken);
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to update password.');
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-accent">
          <KeyRound size={24} />
          <span className="text-lg font-semibold text-gray-100">Set a new password</span>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <p className="text-sm text-muted">
            Your account requires a new password before you can continue.
          </p>
          <div>
            <label className="label">Current password</label>
            <input type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="min 8 characters" required />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={saving || next.length < 8}>
            {saving ? 'Saving…' : 'Update password & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
