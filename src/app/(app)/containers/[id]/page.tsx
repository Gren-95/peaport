'use client';

import { Suspense, use } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { swrFetcher } from '@/lib/client';
import { useSession, can } from '@/components/AppShell';
import { ErrorState, PageHeader, Spinner, stateBadge, timeAgo } from '@/components/ui';
import LogViewer from '@/components/LogViewer';
import StatsPanel from '@/components/StatsPanel';
import ExecTerminal from '@/components/ExecTerminal';

const TABS = ['overview', 'logs', 'exec', 'stats', 'inspect'] as const;
type Tab = (typeof TABS)[number];

interface Inspect {
  Id: string;
  Name?: string;
  Created?: string;
  Path?: string;
  Args?: string[];
  State?: { Status?: string; Running?: boolean; StartedAt?: string; ExitCode?: number; Pid?: number };
  Config?: { Image?: string; Env?: string[]; Cmd?: string[]; WorkingDir?: string; Tty?: boolean };
  Image?: string;
  RestartCount?: number;
  HostConfig?: { RestartPolicy?: { Name?: string }; NetworkMode?: string };
  Mounts?: Array<{ Type?: string; Source?: string; Destination?: string; RW?: boolean; Name?: string }>;
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string }> };
}

function Detail({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useSession();
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'overview';

  const { data, error, isLoading } = useSWR<Inspect>(`/api/containers/${id}`, swrFetcher, {
    refreshInterval: tab === 'overview' ? 5000 : 0,
  });

  const name = data?.Name?.replace(/^\//, '') ?? id.slice(0, 12);

  function setTab(t: Tab) {
    const q = new URLSearchParams(Array.from(params.entries()));
    q.set('tab', t);
    router.replace(`/containers/${id}?${q.toString()}`);
  }

  return (
    <div>
      <Link href="/containers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gray-200">
        <ArrowLeft size={15} /> Containers
      </Link>
      <PageHeader
        title={name}
        subtitle={id.slice(0, 24)}
        actions={data?.State?.Status ? <span className={stateBadge(data.State.Status)}>{data.State.Status}</span> : undefined}
      />

      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize transition-colors ${
              tab === t ? 'border-b-2 border-accent text-gray-100' : 'text-muted hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={(error as Error).message ?? 'Failed to load container.'} />
      ) : isLoading || !data ? (
        <Spinner />
      ) : tab === 'overview' ? (
        <Overview data={data} />
      ) : tab === 'logs' ? (
        <LogViewer containerId={id} />
      ) : tab === 'stats' ? (
        <StatsPanel containerId={id} />
      ) : tab === 'exec' ? (
        can(user.role, 'operator') ? (
          <ExecTerminal containerId={id} />
        ) : (
          <ErrorState message="Exec requires the operator role or higher." />
        )
      ) : (
        <pre className="card max-h-[70vh] overflow-auto p-4 font-mono text-xs text-gray-300">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Overview({ data }: { data: Inspect }) {
  const networks = data.NetworkSettings?.Networks ?? {};
  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-2 gap-x-8 gap-y-3 p-5 text-sm md:grid-cols-3">
        <Field label="Image" value={data.Config?.Image ?? data.Image ?? '—'} />
        <Field label="Command" value={[data.Path, ...(data.Args ?? [])].filter(Boolean).join(' ') || '—'} />
        <Field label="Created" value={data.Created ? timeAgo(Date.parse(data.Created) / 1000) : '—'} />
        <Field label="Started" value={data.State?.StartedAt ? timeAgo(Date.parse(data.State.StartedAt) / 1000) : '—'} />
        <Field label="PID" value={String(data.State?.Pid ?? '—')} />
        <Field label="Exit code" value={String(data.State?.ExitCode ?? '—')} />
        <Field label="Restart policy" value={data.HostConfig?.RestartPolicy?.Name || 'no'} />
        <Field label="Restart count" value={String(data.RestartCount ?? 0)} />
        <Field label="Working dir" value={data.Config?.WorkingDir || '—'} />
      </div>

      <Section title="Networks">
        {Object.keys(networks).length === 0 ? (
          <p className="text-sm text-muted">None</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {Object.entries(networks).map(([net, info]) => (
              <li key={net} className="flex justify-between">
                <span className="text-gray-200">{net}</span>
                <span className="font-mono text-muted">{info.IPAddress || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Mounts">
        {!data.Mounts?.length ? (
          <p className="text-sm text-muted">None</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs">
            {data.Mounts.map((m, i) => (
              <li key={i} className="text-gray-300">
                <span className="text-muted">{m.Type}</span> {m.Source || m.Name} →{' '}
                {m.Destination} <span className="text-muted">({m.RW ? 'rw' : 'ro'})</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.Config?.Env && data.Config.Env.length > 0 && (
        <Section title="Environment">
          <ul className="space-y-1 font-mono text-xs text-gray-300">
            {data.Config.Env.map((e, i) => (
              <li key={i} className="break-all">
                {e}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-200">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-gray-200" title={value}>
        {value}
      </dd>
    </div>
  );
}

export default function ContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Spinner />}>
      <Detail id={id} />
    </Suspense>
  );
}
