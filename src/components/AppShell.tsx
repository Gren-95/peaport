'use client';

import { createContext, useContext, useEffect, useState } from 'react';
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
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Users,
  X,
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

  // Desktop: collapse to an icon rail (persisted). Mobile: off-canvas drawer.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setCollapsed(localStorage.getItem('panel:sidebar') === '1'), []);
  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem('panel:sidebar', next ? '1' : '0');
      return next;
    });
  }

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

  // On desktop the label is hidden only when collapsed; on mobile (drawer) it always shows.
  const labelHidden = collapsed ? 'lg:hidden' : '';

  return (
    <UserContext.Provider value={{ user, engine }}>
      <ToastProvider>
        <div className="flex min-h-screen">
          {/* Backdrop for the mobile drawer */}
          {mobileOpen && (
            <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />
          )}

          <aside
            className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-bg-soft transition-all duration-200 lg:static lg:z-auto lg:translate-x-0 ${
              collapsed ? 'lg:w-16' : 'lg:w-60'
            } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-4">
              <div className={`flex items-center gap-2 text-accent ${collapsed ? 'lg:w-full lg:justify-center' : ''}`}>
                <Boxes size={22} className="shrink-0" />
                <span className={`font-semibold text-gray-100 ${labelHidden}`}>Peaport</span>
              </div>
              {/* Desktop collapse toggle */}
              <button
                onClick={toggleCollapsed}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className={`hidden text-muted hover:text-gray-200 lg:block ${collapsed ? 'lg:hidden' : ''}`}
              >
                <PanelLeftClose size={18} />
              </button>
              {/* Mobile close */}
              <button onClick={() => setMobileOpen(false)} className="text-muted hover:text-gray-200 lg:hidden">
                <X size={20} />
              </button>
            </div>

            {collapsed && (
              <button
                onClick={toggleCollapsed}
                title="Expand sidebar"
                className="mx-auto mb-2 hidden text-muted hover:text-gray-200 lg:block"
              >
                <PanelLeftOpen size={18} />
              </button>
            )}

            <span
              className={`mx-4 mb-3 inline-flex w-fit items-center gap-1 rounded bg-bg-hover px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted ${labelHidden}`}
            >
              {engine}
            </span>

            <nav className="flex-1 space-y-1 overflow-y-auto px-2">
              {NAV.filter((n) => !n.minRole || can(user.role, n.minRole)).map((n) => {
                const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
                const Icon = n.icon;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    title={collapsed ? n.label : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`nav-link ${active ? 'nav-link-active' : ''} ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
                  >
                    <Icon size={17} className="shrink-0" />
                    <span className={labelHidden}>{n.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border p-3">
              <div className={`mb-2 flex items-center justify-between ${labelHidden}`}>
                <span className="truncate text-sm text-gray-200">{user.username}</span>
                <span className={roleBadge[user.role]}>{user.role}</span>
              </div>
              <button
                onClick={logout}
                title={`Sign out (${user.username})`}
                className={`btn-ghost w-full ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
              >
                <LogOut size={15} className="shrink-0" />
                <span className={labelHidden}>Sign out</span>
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar */}
            <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg-soft px-4 py-3 lg:hidden">
              <button onClick={() => setMobileOpen(true)} className="text-gray-200" aria-label="Open menu">
                <Menu size={22} />
              </button>
              <div className="flex items-center gap-2 text-accent">
                <Boxes size={20} />
                <span className="font-semibold text-gray-100">Peaport</span>
              </div>
            </header>

            <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-4 lg:px-6 lg:py-6">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </UserContext.Provider>
  );
}
