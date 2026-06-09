import { ok, withAuth } from '@/lib/api';
import { containers } from '@/lib/resources';
import type { ContainerSummary } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DockerStats {
  cpu_stats?: CpuStats;
  precpu_stats?: CpuStats;
  memory_stats?: { usage?: number; limit?: number; stats?: { cache?: number; inactive_file?: number } };
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

function memUsed(s: DockerStats): number {
  const m = s.memory_stats;
  const cache = m?.stats?.inactive_file ?? m?.stats?.cache ?? 0;
  return Math.max(0, (m?.usage ?? 0) - cache);
}

// Live per-container CPU/memory for running containers, plus totals.
export const GET = withAuth(async () => {
  const running = (await containers.list(false)) as ContainerSummary[];
  const samples = await Promise.all(
    running.map(async (c) => {
      try {
        const s = (await containers.statsOnce(c.Id)) as DockerStats;
        return {
          id: c.Id,
          name: c.Names?.[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
          cpu: cpuPercent(s),
          mem: memUsed(s),
          memLimit: s.memory_stats?.limit ?? 0,
        };
      } catch {
        return null;
      }
    }),
  );

  const list = samples.filter(Boolean) as { id: string; name: string; cpu: number; mem: number; memLimit: number }[];
  list.sort((a, b) => b.mem - a.mem);
  const totals = list.reduce(
    (acc, c) => ({ cpu: acc.cpu + c.cpu, mem: acc.mem + c.mem, count: acc.count + 1 }),
    { cpu: 0, mem: 0, count: 0 },
  );
  return ok({ containers: list, totals });
});
