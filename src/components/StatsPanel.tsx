'use client';

import { useEffect, useState } from 'react';
import { bytes } from '@/components/ui';

interface DockerStats {
  cpu_stats?: CpuStats;
  precpu_stats?: CpuStats;
  memory_stats?: { usage?: number; limit?: number; stats?: { cache?: number; inactive_file?: number } };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
  blkio_stats?: { io_service_bytes_recursive?: Array<{ op: string; value: number }> };
}
interface CpuStats {
  cpu_usage?: { total_usage?: number; percpu_usage?: number[] };
  system_cpu_usage?: number;
  online_cpus?: number;
}

function cpuPercent(s: DockerStats): number {
  const cpu = s.cpu_stats;
  const pre = s.precpu_stats;
  if (!cpu?.cpu_usage || !pre?.cpu_usage) return 0;
  const cpuDelta = (cpu.cpu_usage.total_usage ?? 0) - (pre.cpu_usage.total_usage ?? 0);
  const sysDelta = (cpu.system_cpu_usage ?? 0) - (pre.system_cpu_usage ?? 0);
  const cores = cpu.online_cpus || cpu.cpu_usage.percpu_usage?.length || 1;
  if (sysDelta <= 0 || cpuDelta < 0) return 0;
  return Math.min(100 * cores, (cpuDelta / sysDelta) * cores * 100);
}

function memUsage(s: DockerStats): { used: number; limit: number; pct: number } {
  const m = s.memory_stats;
  const cache = m?.stats?.inactive_file ?? m?.stats?.cache ?? 0;
  const used = Math.max(0, (m?.usage ?? 0) - cache);
  const limit = m?.limit ?? 0;
  return { used, limit, pct: limit ? (used / limit) * 100 : 0 };
}

export default function StatsPanel({ containerId }: { containerId: string }) {
  const [stats, setStats] = useState<DockerStats | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/containers/${containerId}/stats`);
    source.onopen = () => setConnected(true);
    source.onmessage = (e) => {
      try {
        setStats(JSON.parse(e.data));
      } catch {
        /* ignore partial */
      }
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [containerId]);

  if (!stats) {
    return <div className="text-sm text-muted">{connected ? 'Reading stats…' : 'Connecting…'}</div>;
  }

  const cpu = cpuPercent(stats);
  const mem = memUsage(stats);
  const net = Object.values(stats.networks ?? {}).reduce(
    (acc, n) => ({ rx: acc.rx + (n.rx_bytes ?? 0), tx: acc.tx + (n.tx_bytes ?? 0) }),
    { rx: 0, tx: 0 },
  );
  const blk = (stats.blkio_stats?.io_service_bytes_recursive ?? []).reduce(
    (acc, b) => {
      if (b.op.toLowerCase() === 'read') acc.read += b.value;
      if (b.op.toLowerCase() === 'write') acc.write += b.value;
      return acc;
    },
    { read: 0, write: 0 },
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Gauge label="CPU" value={`${cpu.toFixed(1)}%`} pct={cpu} />
      <Gauge label="Memory" value={`${bytes(mem.used)} / ${bytes(mem.limit)}`} pct={mem.pct} />
      <div className="card grid grid-cols-2 gap-4 p-4">
        <Tile label="Net RX" value={bytes(net.rx)} />
        <Tile label="Net TX" value={bytes(net.tx)} />
      </div>
      <div className="card grid grid-cols-2 gap-4 p-4">
        <Tile label="Block read" value={bytes(blk.read)} />
        <Tile label="Block write" value={bytes(blk.write)} />
      </div>
    </div>
  );
}

function Gauge({ label, value, pct }: { label: string; value: string; pct: number }) {
  const color = pct > 85 ? 'bg-danger' : pct > 60 ? 'bg-warn' : 'bg-accent';
  return (
    <div className="card p-4">
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-medium text-gray-100">{value}</div>
    </div>
  );
}
