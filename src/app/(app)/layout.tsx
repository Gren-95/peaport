import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, validateSession } from '@/lib/auth';
import { detectEngine } from '@/lib/podman';
import AppShell from '@/components/AppShell';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const validated = validateSession(store.get(SESSION_COOKIE)?.value);
  if (!validated) redirect('/login');

  const engine = await detectEngine().catch(() => 'docker' as const);

  return (
    <AppShell user={validated.user} csrfToken={validated.session.csrf_token} engine={engine}>
      {children}
    </AppShell>
  );
}
