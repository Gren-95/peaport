'use client';

import { use, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, Square, RotateCw, Download, Trash2, Save, ChevronDown } from 'lucide-react';
import { api, ApiClientError, streamSsePost, swrFetcher } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { useSession, can } from '@/components/AppShell';
import { ErrorState, PageHeader, Spinner, stackStateBadge, stateBadge, timeAgo, useConfirm } from '@/components/ui';
import type { ContainerSummary, Stack } from '@/types';

interface StackDetail {
  stack: Stack;
  containers: ContainerSummary[];
}

function Detail({ name }: { name: string }) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const { confirm, dialog } = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<StackDetail>(`/api/stacks/${name}`, swrFetcher, {
    refreshInterval: 5000,
  });

  const [content, setContent] = useState<string | null>(null);
  const [removeVolumes, setRemoveVolumes] = useState(false);
  const [console, setConsole] = useState<{ title: string; lines: string[]; running: boolean } | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const editorValue = content ?? data?.stack.content ?? '';
  const dirty = content !== null && content !== data?.stack.content;
  const isOperator = can(user.role, 'operator');
  const isAdmin = can(user.role, 'admin');

  async function save() {
    try {
      await api(`/api/stacks/${name}`, { method: 'PUT', body: { content: editorValue } });
      toast.success('Compose file saved');
      setContent(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to save');
    }
  }

  async function runAction(action: string, label: string, volumes = false) {
    if (console?.running) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setConsole({ title: label, lines: [], running: true });
    try {
      await streamSsePost(`/api/stacks/${name}/${action}${volumes ? '?volumes=true' : ''}`, {
        signal: ctrl.signal,
        onLine: (line) => {
          setConsole((c) => (c ? { ...c, lines: [...c.lines.slice(-1000), line] } : c));
          requestAnimationFrame(() => {
            if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
          });
        },
      });
      setConsole((c) => (c ? { ...c, running: false } : c));
      mutate();
    } catch (err) {
      setConsole((c) =>
        c ? { ...c, running: false, lines: [...c.lines, `✗ ${err instanceof Error ? err.message : 'failed'}`] } : c,
      );
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete stack',
      message: `Bring down and delete stack "${name}"? This runs "compose down"${removeVolumes ? ' --volumes' : ''} and removes the stored file.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/stacks/${name}?volumes=${removeVolumes}`, { method: 'DELETE' });
      toast.success('Stack deleted');
      router.push('/stacks');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to delete');
    }
  }

  if (error) {
    return (
      <div>
        <BackLink />
        <ErrorState message={(error as Error).message ?? 'Failed to load stack.'} />
      </div>
    );
  }
  if (isLoading || !data) return <Spinner />;

  const state = data.containers.length
    ? data.containers.every((c) => c.State === 'running')
      ? 'running'
      : data.containers.some((c) => c.State === 'running')
        ? 'partial'
        : 'stopped'
    : 'inactive';

  return (
    <div>
      <BackLink />
      {dialog}
      <PageHeader
        title={name}
        subtitle={data.stack.createdBy ? `created by ${data.stack.createdBy}` : undefined}
        actions={<span className={stackStateBadge(state)}>{state}</span>}
      />

      {isOperator && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={() => runAction('up', 'Deploy (up -d)')} disabled={console?.running}>
            <Play size={15} /> Deploy
          </button>
          <button className="btn-ghost" onClick={() => runAction('pull', 'Pull images')} disabled={console?.running}>
            <Download size={15} /> Pull
          </button>
          <button className="btn-ghost" onClick={() => runAction('restart', 'Restart')} disabled={console?.running}>
            <RotateCw size={15} /> Restart
          </button>
          <button className="btn-ghost" onClick={() => runAction('stop', 'Stop')} disabled={console?.running}>
            <Square size={15} /> Stop
          </button>
          <button
            className="btn-ghost"
            onClick={() => runAction('down', `Down${removeVolumes ? ' --volumes' : ''}`, removeVolumes)}
            disabled={console?.running}
          >
            <ChevronDown size={15} /> Down
          </button>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={removeVolumes}
              onChange={(e) => setRemoveVolumes(e.target.checked)}
              disabled={!isAdmin}
            />
            remove volumes {isAdmin ? '' : '(admin only)'}
          </label>
          {isAdmin && (
            <button className="btn-danger ml-auto" onClick={remove} disabled={console?.running}>
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      )}

      {console && (
        <div className="card mb-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
            <span className="flex items-center gap-2 text-muted">
              <span className={`h-2 w-2 rounded-full ${console.running ? 'bg-warn' : 'bg-ok'}`} />
              {console.title} {console.running ? '· running…' : '· done'}
            </span>
            <button className="text-muted hover:text-gray-200" onClick={() => setConsole(null)}>
              close
            </button>
          </div>
          <div
            ref={consoleRef}
            className="max-h-72 overflow-auto bg-[#0a0c11] px-3 py-2 font-mono text-xs leading-relaxed text-gray-300"
          >
            {console.lines.length === 0 ? (
              <span className="text-muted">Starting…</span>
            ) : (
              console.lines.map((l, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {l}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium text-gray-200">compose.yaml</span>
            {isOperator && (
              <button className="btn-primary btn-xs" onClick={save} disabled={!dirty}>
                <Save size={13} /> Save
              </button>
            )}
          </div>
          <textarea
            className="h-[60vh] w-full resize-none bg-[#0a0c11] p-3 font-mono text-xs text-gray-200 focus:outline-none"
            spellCheck={false}
            value={editorValue}
            readOnly={!isOperator}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-border px-3 py-2 text-sm font-medium text-gray-200">
            Containers ({data.containers.length})
          </div>
          {data.containers.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted">No containers. Deploy the stack to create them.</p>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-border">
                {data.containers.map((c) => (
                  <tr key={c.Id} className="hover:bg-bg-hover/50">
                    <td className="td">
                      <Link href={`/containers/${c.Id}`} className="font-medium text-gray-100 hover:text-accent">
                        {c.Labels?.['com.docker.compose.service'] ?? c.Names?.[0]?.replace(/^\//, '')}
                      </Link>
                      <div className="text-xs text-muted">{c.Image}</div>
                    </td>
                    <td className="td text-right">
                      <span className={stateBadge(c.State)}>{c.State}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="border-t border-border px-3 py-2 text-xs text-muted">
            Updated {timeAgo(data.stack.updatedAt / 1000)}
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/stacks" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gray-200">
      <ArrowLeft size={15} /> Stacks
    </Link>
  );
}

export default function StackDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  return <Detail name={name} />;
}
