'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui';

interface EngineEvent {
  Type?: string;
  Action?: string;
  Actor?: { ID?: string; Attributes?: Record<string, string> };
  time?: number;
  id?: string;
  status?: string;
  from?: string;
}

interface Row {
  key: string;
  ts: number;
  type: string;
  action: string;
  name: string;
  id: string;
}

function typeBadge(type: string): string {
  switch (type) {
    case 'container':
      return 'badge-ok';
    case 'image':
      return 'badge-warn';
    case 'network':
      return 'badge-muted';
    case 'volume':
      return 'badge-muted';
    default:
      return 'badge-muted';
  }
}

let seq = 0;

export default function EventsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      if (pausedRef.current) return;
      let evt: EngineEvent;
      try {
        evt = JSON.parse(e.data);
      } catch {
        return;
      }
      const attrs = evt.Actor?.Attributes ?? {};
      const row: Row = {
        key: `${++seq}`,
        ts: (evt.time ?? Date.now() / 1000) * 1000,
        type: evt.Type ?? 'unknown',
        action: evt.Action ?? evt.status ?? '',
        name: attrs.name ?? evt.from ?? '',
        id: (evt.Actor?.ID ?? evt.id ?? '').slice(0, 12),
      };
      setRows((prev) => [row, ...prev].slice(0, 500));
    };
    return () => source.close();
  }, []);

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Live engine event stream"
        actions={
          <>
            <span className="flex items-center gap-2 text-xs text-muted">
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-ok' : 'bg-danger'}`} />
              {connected ? 'streaming' : 'disconnected'}
            </span>
            <button className="btn-ghost btn-xs" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={13} /> : <Pause size={13} />}
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button className="btn-ghost btn-xs" onClick={() => setRows([])}>
              <Trash2 size={13} /> Clear
            </button>
          </>
        }
      />

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted">
            Waiting for events… trigger an action (start/stop a container, pull an image) to see them here.
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border bg-bg-soft">
              <tr>
                <th className="th">Time</th>
                <th className="th">Type</th>
                <th className="th">Action</th>
                <th className="th">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-bg-hover/50">
                  <td className="td whitespace-nowrap text-muted">
                    {new Date(r.ts).toLocaleTimeString(undefined, { hour12: false })}
                  </td>
                  <td className="td">
                    <span className={typeBadge(r.type)}>{r.type}</span>
                  </td>
                  <td className="td">
                    <div className="max-w-[28rem] truncate font-medium text-gray-200" title={r.action}>
                      {r.action}
                    </div>
                  </td>
                  <td className="td">
                    <span className="text-gray-300">{r.name || '—'}</span>
                    {r.id && <span className="ml-2 font-mono text-xs text-muted">{r.id}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
