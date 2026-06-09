'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-muted" />;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-12 text-sm text-muted">
      {message}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-gray-200">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation dialog hook returning a trigger and the rendered modal. */
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    resolve?: (v: boolean) => void;
  }>({ open: false, title: '', message: '', confirmLabel: 'Confirm', danger: false });

  const confirm = (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => {
      setState({
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        danger: opts.danger ?? false,
        resolve,
      });
    });

  const finish = (v: boolean) => {
    state.resolve?.(v);
    setState((s) => ({ ...s, open: false }));
  };

  const dialog = (
    <Modal
      open={state.open}
      onClose={() => finish(false)}
      title={state.title}
      footer={
        <>
          <button className="btn-ghost" onClick={() => finish(false)}>
            Cancel
          </button>
          <button className={state.danger ? 'btn-danger' : 'btn-primary'} onClick={() => finish(true)}>
            {state.confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-300">{state.message}</p>
    </Modal>
  );

  return { confirm, dialog };
}

export function stateBadge(state: string): string {
  switch (state) {
    case 'running':
      return 'badge-ok';
    case 'paused':
      return 'badge-warn';
    case 'exited':
    case 'dead':
      return 'badge-danger';
    default:
      return 'badge-muted';
  }
}

export function stackStateBadge(state: 'running' | 'partial' | 'stopped' | 'inactive'): string {
  switch (state) {
    case 'running':
      return 'badge-ok';
    case 'partial':
      return 'badge-warn';
    case 'stopped':
      return 'badge-danger';
    default:
      return 'badge-muted';
  }
}

export function timeAgo(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  const diff = Date.now() / 1000 - unixSeconds;
  const units: [number, string][] = [
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ];
  for (const [secs, label] of units) {
    if (diff >= secs) return `${Math.floor(diff / secs)}${label} ago`;
  }
  return `${Math.max(0, Math.floor(diff))}s ago`;
}

export function bytes(n: number | undefined): string {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
