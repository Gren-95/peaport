'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Container, HardDrive, Image as ImageIcon, Network, Boxes, Cpu } from 'lucide-react';
import { swrFetcher } from '@/lib/client';
import { PageHeader, Spinner, bytes } from '@/components/ui';
import type { ContainerSummary } from '@/types';

interface SystemData {
  engine: string;
  info: { ServerVersion?: string; OperatingSystem?: string; NCPU?: number; MemTotal?: number; Name?: string } | null;
  version: { Version?: string; ApiVersion?: string } | null;
}

export default function DashboardPage() {
  const { data: system } = useSWR<SystemData>('/api/system', swrFetcher, { refreshInterval: 15000 });
  const { data: containers } = useSWR<{ containers: ContainerSummary[] }>('/api/containers', swrFetcher, {
    refreshInterval: 10000,
  });
  const { data: images } = useSWR<{ images: unknown[] }>('/api/images', swrFetcher);
  const { data: volumes } = useSWR<{ Volumes: unknown[] }>('/api/volumes', swrFetcher);
  const { data: networks } = useSWR<{ networks: unknown[] }>('/api/networks', swrFetcher);
  const { data: pods } = useSWR<{ supported: boolean; pods: unknown[] }>('/api/pods', swrFetcher);

  const running = containers?.containers.filter((c) => c.State === 'running').length ?? 0;
  const total = containers?.containers.length ?? 0;

  const stats = [
    { label: 'Containers', value: `${running} / ${total}`, hint: 'running / total', icon: Container, href: '/containers' },
    { label: 'Images', value: images?.images.length ?? '—', icon: ImageIcon, href: '/images' },
    { label: 'Volumes', value: volumes?.Volumes?.length ?? '—', icon: HardDrive, href: '/volumes' },
    { label: 'Networks', value: networks?.networks.length ?? '—', icon: Network, href: '/networks' },
    {
      label: 'Pods',
      value: pods?.supported ? pods.pods.length : 'n/a',
      hint: pods?.supported ? undefined : 'Podman only',
      icon: Boxes,
      href: '/pods',
    },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Engine overview and resource summary" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
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

      <div className="mt-6 card p-5">
        <div className="mb-4 flex items-center gap-2 text-gray-200">
          <Cpu size={18} className="text-accent" />
          <h2 className="font-semibold">Engine</h2>
        </div>
        {!system ? (
          <Spinner />
        ) : (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-3">
            <Field label="Engine" value={system.engine} />
            <Field label="Version" value={system.version?.Version ?? system.info?.ServerVersion ?? '—'} />
            <Field label="API version" value={system.version?.ApiVersion ?? '—'} />
            <Field label="Host" value={system.info?.Name ?? '—'} />
            <Field label="OS" value={system.info?.OperatingSystem ?? '—'} />
            <Field label="CPUs" value={String(system.info?.NCPU ?? '—')} />
            <Field label="Memory" value={bytes(system.info?.MemTotal)} />
          </dl>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-gray-200">{value}</dd>
    </div>
  );
}
