'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/client';
import { useSession } from '@/components/AppShell';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui';

interface AuditEntry {
  id: number;
  ts: number;
  username: string | null;
  role: string | null;
  method: string;
  path: string;
  action: string;
  status: number;
  outcome: string;
  ip: string | null;
}

const PAGE = 100;

function fmt(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { hour12: false });
}

export default function AuditPage() {
  const { user } = useSession();
  const [offset, setOffset] = useState(0);
  const [outcome, setOutcome] = useState<'' | 'success' | 'failure'>('');

  const query = `/api/audit?limit=${PAGE}&offset=${offset}${outcome ? `&outcome=${outcome}` : ''}`;
  const { data, error, isLoading } = useSWR<{ entries: AuditEntry[]; total: number }>(
    user.role === 'admin' ? query : null,
    swrFetcher,
    { refreshInterval: 10000 },
  );

  if (user.role !== 'admin') {
    return (
      <div>
        <PageHeader title="Audit log" />
        <ErrorState message="The audit log requires the admin role." />
      </div>
    );
  }

  const total = data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle={`${total} recorded action${total === 1 ? '' : 's'}`}
        actions={
          <select
            className="rounded-md border border-border bg-bg-soft px-2 py-1.5 text-sm text-gray-200"
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value as '' | 'success' | 'failure');
              setOffset(0);
            }}
          >
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
        }
      />

      {error ? (
        <ErrorState message={(error as Error).message} />
      ) : isLoading && !data ? (
        <Spinner />
      ) : !data?.entries.length ? (
        <EmptyState message="No audit entries yet." />
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-border bg-bg-soft">
                <tr>
                  <th className="th">Time</th>
                  <th className="th">User</th>
                  <th className="th">Action</th>
                  <th className="th">Outcome</th>
                  <th className="th">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.entries.map((e) => (
                  <tr key={e.id} className="hover:bg-bg-hover/50">
                    <td className="td whitespace-nowrap text-muted">{fmt(e.ts)}</td>
                    <td className="td">
                      <span className="text-gray-100">{e.username ?? '—'}</span>
                      {e.role && <span className="ml-1 text-xs text-muted">({e.role})</span>}
                    </td>
                    <td className="td">
                      <span className="text-gray-200">{e.action}</span>
                      <span className="ml-2 font-mono text-xs text-muted">
                        {e.method} {e.path}
                      </span>
                    </td>
                    <td className="td">
                      <span className={e.outcome === 'success' ? 'badge-ok' : 'badge-danger'}>
                        {e.status} {e.outcome}
                      </span>
                    </td>
                    <td className="td font-mono text-xs text-muted">{e.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted">
            <span>
              {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button className="btn-ghost btn-xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                Newer
              </button>
              <button
                className="btn-ghost btn-xs"
                disabled={offset + PAGE >= total}
                onClick={() => setOffset(offset + PAGE)}
              >
                Older
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
