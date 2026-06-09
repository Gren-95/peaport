'use client';

import { createContext, useContext, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Boxes,
  Container,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  Network,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import { api, setCsrfToken } from '@/lib/client';
import { ToastProvider } from '@/components/Toast';
import type { Role, SessionUser } from '@/types';

interface ShellData {
  user: SessionUser;
  engine: 'podman' | 'docker';
}

const UserContext = createContext<ShellData | null>(null);
export function useSession(): ShellData {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useSession must be used within AppShell');
  return ctx;
}
export function can(role: Role, required: Role): boolean {
  const rank: Record<Role, number> = { viewer: 1, operator: 2, admin: 3 };
  return rank[role] >= rank[required];
}

const NAV: { href: string; label: string; icon: typeof Container; minRole?: Role }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/stacks', label: 'Stacks', icon: Layers },
  { href: '/containers', label: 'Containers', icon: Container },
  { href: '/images', label: 'Images', icon: ImageIcon },
  { href: '/volumes', label: 'Volumes', icon: HardDrive },
  { href: '/networks', label: 'Networks', icon: Network },
  { href: '/pods', label: 'Pods', icon: Boxes },
  { href: '/secrets', label: 'Secrets', icon: KeyRound, minRole: 'operator' },
  { href: '/events', label: 'Events', icon: Activity },
  { href: '/audit', label: 'Audit', icon: ScrollText, minRole: 'admin' },
  { href: '/users', label: 'Users', icon: Users, minRole: 'admin' },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function AppShell({
  user,
  csrfToken,
  engine,
  children,
}: {
  user: SessionUser;
  csrfToken: string;
  engine: 'podman' | 'docker';
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Make the CSRF token available to client mutations.
  setCsrfToken(csrfToken);
  useEffect(() => setCsrfToken(csrfToken), [csrfToken]);

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    router.replace('/login');
    router.refresh();
  }

  const roleBadge: Record<Role, string> = {
    admin: 'badge-danger',
    operator: 'badge-warn',
    viewer: 'badge-muted',
  };

  return (
    <UserContext.Provider value={{ user, engine }}>
      <ToastProvider>
        <div className="flex min-h-screen">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-soft">
            <div className="flex items-center gap-2 px-4 py-4 text-accent">
              <Boxes size={22} />
              <span className="font-semibold text-gray-100">Podman Panel</span>
            </div>
            <span className="mx-4 mb-3 inline-flex w-fit items-center gap-1 rounded bg-bg-hover px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted">
              {engine}
            </span>
            <nav className="flex-1 space-y-1 px-2">
              {NAV.filter((n) => !n.minRole || can(user.role, n.minRole)).map((n) => {
                const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href} className={`nav-link ${active ? 'nav-link-active' : ''}`}>
                    <Icon size={17} />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="truncate text-sm text-gray-200">{user.username}</span>
                <span className={roleBadge[user.role]}>{user.role}</span>
              </div>
              <button onClick={logout} className="btn-ghost w-full">
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </aside>
          <main className="flex-1 overflow-x-hidden px-6 py-6">{children}</main>
        </div>
      </ToastProvider>
    </UserContext.Provider>
  );
}
