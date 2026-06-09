'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Activity, Boxes, Container, Cpu, HardDrive, Image as ImageIcon, Layers, MemoryStick, Network } from 'lucide-react';
import { swrFetcher } from '@/lib/client';
import { PageHeader, Spinner, bytes } from '@/components/ui';
import type { ContainerSummary, StackStatus } from '@/types';

interface SystemData {
  engine: string;
  info: {
    ServerVersion?: string;
    OperatingSystem?: string;
    NCPU?: number;
    MemTotal?: number;
    Name?: string;
    KernelVersion?: string;
    Architecture?: string;
    Driver?: string;
  } | null;
  version: { Version?: string; ApiVersion?: string } | null;
  df: { Images?: { Size?: number }[]; Containers?: { SizeRw?: number }[]; Volumes?: { UsageData?: { Size?: number } }[]; BuildCache?: { Size?: number }[] } | null;
}
interface Usage {
  containers: { id: string; name: string; cpu: number; mem: number; memLimit: number }[];
  totals: { cpu: number; mem: number; count: number };
}

const sum = (arr: (number | undefined)[]) => arr.reduce<number>((a, n) => a + (n && n > 0 ? n : 0), 0);

export default function DashboardPage() {
  const { data: system } = useSWR<SystemData>('/api/system', swrFetcher, { refreshInterval: 30000 });
  const { data: usage } = useSWR<Usage>('/api/system/usage', swrFetcher, { refreshInterval: 5000 });
  const { data: containers } = useSWR<{ containers: ContainerSummary[] }>('/api/containers', swrFetcher, { refreshInterval: 5000 });
  const { data: images } = useSWR<{ images: unknown[] }>('/api/images', swrFetcher);
  const { data: volumes } = useSWR<{ Volumes: unknown[] }>('/api/volumes', swrFetcher);
  const { data: networks } = useSWR<{ networks: unknown[] }>('/api/networks', swrFetcher);
  const { data: pods } = useSWR<{ supported: boolean; pods: unknown[] }>('/api/pods', swrFetcher);
  const { data: stacks } = useSWR<{ stacks: StackStatus[] }>('/api/stacks', swrFetcher, { refreshInterval: 10000 });

  const cs = containers?.containers ?? [];
  const states = {
    running: cs.filter((c) => c.State === 'running').length,
    exited: cs.filter((c) => c.State === 'exited' || c.State === 'dead').length,
    paused: cs.filter((c) => c.State === 'paused').length,
    created: cs.filter((c) => c.State === 'created').length,
  };

  const memTotal = system?.info?.MemTotal ?? 0;
  const memUsedPct = memTotal ? (usage?.totals.mem ?? 0) / memTotal * 100 : 0;
  const cpuPct = system?.info?.NCPU ? (usage?.totals.cpu ?? 0) / system.info.NCPU : usage?.totals.cpu ?? 0;

  const disk = system?.df
    ? {
        images: sum((system.df.Images ?? []).map((i) => i.Size)),
        containers: sum((system.df.Containers ?? []).map((c) => c.SizeRw)),
        volumes: sum((system.df.Volumes ?? []).map((v) => v.UsageData?.Size)),
        buildCache: sum((system.df.BuildCache ?? []).map((b) => b.Size)),
      }
    : null;

  const stats = [
    { label: 'Containers', value: `${states.running} / ${cs.length}`, hint: 'running / total', icon: Container, href: '/containers' },
    { label: 'Stacks', value: stacks?.stacks.length ?? '—', icon: Layers, href: '/stacks' },
    { label: 'Images', value: images?.images.length ?? '—', icon: ImageIcon, href: '/images' },
    { label: 'Volumes', value: volumes?.Volumes?.length ?? '—', icon: HardDrive, href: '/volumes' },
    { label: 'Networks', value: networks?.networks.length ?? '—', icon: Network, href: '/networks' },
    { label: 'Pods', value: pods?.supported ? pods.pods.length : 'n/a', icon: Boxes, href: '/pods' },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Engine overview, live usage, and activity" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="card p-4 transition-colors hover:bg-bg-hover">
              <div className="mb-2 flex items-center justify-between text-muted">
                <span className="text-xs uppercase tracking-wide">{s.label}</span>
                <Icon size={16} />
              </div>
              <div className="text-2xl font-semibold text-gray-100">{s.value}</div>
              {s.hint && <div className="mt-0.5 text-xs text-muted">{s.hint}</div>}
            </Link>
          );
        })}
      </div>

      {/* Live usage + container states */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <CardTitle icon={Cpu} title="Live usage" hint={`${usage?.totals.count ?? 0} running`} />
          <Gauge label="CPU" value={`${cpuPct.toFixed(1)}%`} pct={cpuPct} />
          <div className="mt-3">
            <Gauge label="Memory" value={`${bytes(usage?.totals.mem ?? 0)}${memTotal ? ` / ${bytes(memTotal)}` : ''}`} pct={memUsedPct} />
          </div>
          <div className="mt-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted">Top by memory</div>
            {!usage?.containers.length ? (
              <p className="text-sm text-muted">No running containers</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {usage.containers.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <Link href={`/containers/${c.id}`} className="truncate text-gray-200 hover:text-accent">{c.name}</Link>
                    <span className="shrink-0 font-mono text-xs text-muted">{c.cpu.toFixed(0)}% · {bytes(c.mem)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card p-5">
          <CardTitle icon={Container} title="Container states" />
          <StateBar states={states} total={cs.length} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <StateRow color="bg-ok" label="Running" n={states.running} />
            <StateRow color="bg-danger" label="Exited" n={states.exited} />
            <StateRow color="bg-warn" label="Paused" n={states.paused} />
            <StateRow color="bg-muted" label="Created" n={states.created} />
          </div>
        </div>

        <div className="card p-5">
          <CardTitle icon={HardDrive} title="Disk usage" />
          {!disk ? (
            <Spinner />
          ) : (
            <ul className="space-y-2 text-sm">
              <DiskRow label="Images" value={disk.images} />
              <DiskRow label="Containers (writable)" value={disk.containers} />
              <DiskRow label="Volumes" value={disk.volumes} />
              <DiskRow label="Build cache" value={disk.buildCache} />
              <li className="flex justify-between border-t border-border pt-2 font-medium text-gray-100">
                <span>Total</span>
                <span>{bytes(disk.images + disk.containers + disk.volumes + disk.buildCache)}</span>
              </li>
            </ul>
          )}
        </div>
      </div>

      {/* Engine + recent events */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <CardTitle icon={Cpu} title="Engine" />
          {!system ? (
            <Spinner />
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Engine" value={system.engine} />
              <Field label="Version" value={system.version?.Version ?? system.info?.ServerVersion ?? '—'} />
              <Field label="API" value={system.version?.ApiVersion ?? '—'} />
              <Field label="Host" value={system.info?.Name ?? '—'} />
              <Field label="OS" value={system.info?.OperatingSystem ?? '—'} />
              <Field label="Kernel" value={system.info?.KernelVersion ?? '—'} />
              <Field label="Arch" value={system.info?.Architecture ?? '—'} />
              <Field label="Storage driver" value={system.info?.Driver ?? '—'} />
              <Field label="CPUs" value={String(system.info?.NCPU ?? '—')} />
              <Field label="Memory" value={bytes(system.info?.MemTotal)} />
            </dl>
          )}
        </div>

        <div className="card p-5">
          <CardTitle icon={Activity} title="Recent events" hint={<Link href="/events" className="hover:text-accent">view all</Link>} />
          <RecentEvents />
        </div>
      </div>
    </div>
  );
}

function CardTitle({ icon: Icon, title, hint }: { icon: typeof Cpu; title: string; hint?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-gray-200">
        <Icon size={17} className="text-accent" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function Gauge({ label, value, pct }: { label: string; value: string; pct: number }) {
  const color = pct > 85 ? 'bg-danger' : pct > 60 ? 'bg-warn' : 'bg-accent';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-gray-100">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-soft">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function StateBar({ states, total }: { states: Record<string, number>; total: number }) {
  if (!total) return <p className="text-sm text-muted">No containers</p>;
  const seg = (n: number, c: string) => (n ? <div className={c} style={{ width: `${(n / total) * 100}%` }} /> : null);
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-bg-soft">
      {seg(states.running, 'bg-ok')}
      {seg(states.paused, 'bg-warn')}
      {seg(states.exited, 'bg-danger')}
      {seg(states.created, 'bg-muted')}
    </div>
  );
}

function StateRow({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-muted">{label}</span>
      <span className="ml-auto font-medium text-gray-200">{n}</span>
    </div>
  );
}

function DiskRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-gray-200">{bytes(value)}</span>
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-gray-200" title={value}>{value}</dd>
    </div>
  );
}

function RecentEvents() {
  const [rows, setRows] = useState<{ k: number; t: number; type: string; action: string; name: string }[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    const src = new EventSource('/api/events');
    src.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        const row = {
          k: ++seq.current,
          t: (evt.time ?? Date.now() / 1000) * 1000,
          type: evt.Type ?? '?',
          action: evt.Action ?? evt.status ?? '',
          name: evt.Actor?.Attributes?.name ?? evt.from ?? '',
        };
        setRows((p) => [row, ...p].slice(0, 8));
      } catch {
        /* ignore */
      }
    };
    return () => src.close();
  }, []);

  if (!rows.length) return <p className="text-sm text-muted">Waiting for activity…</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.k} className="flex items-center gap-2">
          <span className="w-14 shrink-0 font-mono text-xs text-muted">
            {new Date(r.t).toLocaleTimeString(undefined, { hour12: false }).slice(0, 8)}
          </span>
          <span className="shrink-0 text-xs text-muted">{r.type}</span>
          <span className="font-medium text-gray-200">{r.action}</span>
          <span className="ml-auto truncate text-xs text-muted">{r.name}</span>
        </li>
      ))}
    </ul>
  );
}
