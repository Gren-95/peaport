'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Activity, AlertTriangle, Boxes, Container, Cpu, HardDrive, Heart, Image as ImageIcon, Layers, Network, Plug } from 'lucide-react';
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
    Warnings?: string[] | null;
  } | null;
  version: { Version?: string; ApiVersion?: string } | null;
  df: {
    Images?: { Size?: number }[];
    Containers?: { SizeRw?: number }[];
    Volumes?: { Name?: string; UsageData?: { Size?: number } }[];
    BuildCache?: { Size?: number }[];
  } | null;
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

  // Keep a short rolling history of usage samples for the sparklines.
  const [cpuHist, setCpuHist] = useState<number[]>([]);
  const [memHist, setMemHist] = useState<number[]>([]);
  useEffect(() => {
    if (!usage) return;
    setCpuHist((h) => [...h, cpuPct].slice(-40));
    setMemHist((h) => [...h, usage.totals.mem].slice(-40));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usage]);

  // Containers needing attention: unhealthy, or exited with a non-zero code.
  const attention = cs
    .map((c) => {
      const status = c.Status ?? '';
      if (/\(unhealthy\)/i.test(status)) return { c, reason: 'unhealthy', danger: false };
      const exit = status.match(/^Exited \((\d+)\)/);
      if (exit && exit[1] !== '0') return { c, reason: `exited (${exit[1]})`, danger: true };
      return null;
    })
    .filter(Boolean) as { c: ContainerSummary; reason: string; danger: boolean }[];

  // Published host ports across all containers.
  const ports = cs
    .flatMap((c) =>
      (c.Ports ?? [])
        .filter((p) => p.PublicPort)
        .map((p) => ({
          id: c.Id,
          name: c.Names?.[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
          host: p.PublicPort!,
          container: p.PrivatePort,
          proto: p.Type ?? 'tcp',
          ip: p.IP && p.IP !== '0.0.0.0' && p.IP !== '::' ? p.IP : null,
        })),
    )
    .sort((a, b) => a.host - b.host);

  const topVolumes = [...(system?.df?.Volumes ?? [])]
    .filter((v) => (v.UsageData?.Size ?? 0) > 0)
    .sort((a, b) => (b.UsageData?.Size ?? 0) - (a.UsageData?.Size ?? 0))
    .slice(0, 5);

  const warnings = system?.info?.Warnings ?? [];

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

      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-warn/30 bg-warn/10 p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-warn">
            <AlertTriangle size={16} /> Engine warnings ({warnings.length})
          </div>
          <ul className="ml-6 list-disc space-y-0.5 text-xs text-gray-300">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

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
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">CPU trend</div>
              <Sparkline data={cpuHist} max={100} color="#7c5cff" />
            </div>
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Memory trend</div>
              <Sparkline data={memHist} max={memTotal || undefined} color="#3ecf8e" />
            </div>
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
          {topVolumes.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted">
                <span>Largest volumes</span>
                <Link href="/volumes" className="hover:text-accent">manage</Link>
              </div>
              <ul className="space-y-1 text-sm">
                {topVolumes.map((v) => (
                  <li key={v.Name} className="flex justify-between gap-2">
                    <span className="truncate text-gray-300" title={v.Name}>{v.Name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{bytes(v.UsageData?.Size)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Attention + published ports */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <CardTitle
            icon={Heart}
            title="Needs attention"
            hint={attention.length === 0 ? 'all good' : `${attention.length} issue${attention.length === 1 ? '' : 's'}`}
          />
          {attention.length === 0 ? (
            <p className="text-sm text-muted">No unhealthy or failed containers.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {attention.map(({ c, reason, danger }) => (
                <li key={c.Id} className="flex items-center justify-between gap-2">
                  <Link href={`/containers/${c.Id}`} className="truncate text-gray-100 hover:text-accent">
                    {c.Names?.[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12)}
                  </Link>
                  <span className={danger ? 'badge-danger' : 'badge-warn'}>{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <CardTitle icon={Plug} title="Published ports" hint={`${ports.length} exposed`} />
          {ports.length === 0 ? (
            <p className="text-sm text-muted">No published ports.</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-auto text-sm">
              {ports.map((p, i) => (
                <li key={`${p.id}-${p.host}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-gray-200">
                    {p.ip ? `${p.ip}:` : ''}
                    {p.host} <span className="text-muted">→ {p.container}/{p.proto}</span>
                  </span>
                  <Link href={`/containers/${p.id}`} className="truncate text-xs text-muted hover:text-accent">
                    {p.name}
                  </Link>
                </li>
              ))}
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

      <div className="mt-4 card p-5">
        <CardTitle icon={Network} title="Network adapters" />
        <NetworkAdapters />
      </div>
    </div>
  );
}

interface Adapter {
  name: string;
  mac: string | null;
  internal: boolean;
  type: string | null;
  connection: string | null;
  assignment: 'dhcp' | 'static' | 'link-local' | 'disabled' | 'unknown';
  addresses: { family: 'IPv4' | 'IPv6'; address: string; cidr: string | null }[];
}

function assignmentBadge(a: Adapter['assignment']): string {
  if (a === 'static') return 'badge-ok';
  if (a === 'dhcp') return 'badge bg-accent/15 text-accent';
  return 'badge-muted';
}

function NetworkAdapters() {
  const { data } = useSWR<{ adapters: Adapter[]; detection: string }>('/api/system/network', swrFetcher, {
    refreshInterval: 30000,
  });
  if (!data) return <Spinner />;
  const adapters = data.adapters.filter((a) => !a.internal || a.addresses.some((x) => x.family === 'IPv4'));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className="th">Interface</th>
              <th className="th">IPv4</th>
              <th className="th">IPv6</th>
              <th className="th">MAC</th>
              <th className="th">Assignment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {adapters.map((a) => {
              const v4 = a.addresses.find((x) => x.family === 'IPv4');
              const v6 = a.addresses.find((x) => x.family === 'IPv6' && !x.address.startsWith('fe80'));
              return (
                <tr key={a.name} className="hover:bg-bg-hover/50">
                  <td className="td">
                    <span className="font-medium text-gray-100">{a.name}</span>
                    {a.type && <span className="ml-2 text-xs text-muted">{a.type}</span>}
                  </td>
                  <td className="td font-mono text-xs">{v4 ? (v4.cidr ?? v4.address) : '—'}</td>
                  <td className="td font-mono text-xs text-muted" title={v6?.address}>
                    {v6 ? v6.address : '—'}
                  </td>
                  <td className="td font-mono text-xs text-muted">{a.mac ?? '—'}</td>
                  <td className="td">
                    <span className={assignmentBadge(a.assignment)}>{a.assignment}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.detection === 'unavailable' && (
        <p className="mt-3 text-xs text-muted">
          Static/DHCP shown as &quot;unknown&quot; — NetworkManager/systemd-networkd is not reachable from the
          container. Run with host networking (<code>./jumpstart.sh --host-net</code>) to read real adapters.
        </p>
      )}
    </>
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

function Sparkline({ data, max, color }: { data: number[]; max?: number; color: string }) {
  if (data.length < 2) return <div className="flex h-8 items-center text-[11px] text-muted">collecting…</div>;
  const w = 100;
  const h = 28;
  const peak = max || Math.max(...data, 1);
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - Math.min(1, v / peak) * h}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
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
          <span className="w-14 shrink-0 font-mono text-[11px] text-muted">
            {new Date(r.t).toLocaleTimeString(undefined, { hour12: false }).slice(0, 8)}
          </span>
          <span className="w-16 shrink-0 truncate text-xs text-muted" title={r.type}>
            {r.type}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-gray-200" title={r.action}>
            {r.action}
          </span>
          {r.name && (
            <span className="max-w-[28%] shrink-0 truncate text-xs text-muted" title={r.name}>
              {r.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
