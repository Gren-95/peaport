import { ok, withAuth } from '@/lib/api';
import { system } from '@/lib/resources';
import { detectEngine } from '@/lib/podman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const [info, version, df, engine] = await Promise.all([
    system.info().catch(() => null),
    system.version().catch(() => null),
    system.df().catch(() => null),
    detectEngine().catch(() => 'docker' as const),
  ]);
  return ok({ engine, info, version, df });
});
