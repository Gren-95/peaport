'use client';

import { useEffect, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';

export default function ExecTerminal({ containerId }: { containerId: string }) {
  const [shell, setShell] = useState('/bin/sh');
  const [reconnectKey, setReconnectKey] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let cleanupResize: (() => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let term: any = null;

    (async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      if (disposed || !mountRef.current) return;

      term = new Terminal({
        cursorBlink: true,
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        theme: { background: '#0a0c11', foreground: '#d4d7dd', cursor: '#7c5cff' },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(mountRef.current);
      fit.fit();

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(
        `${proto}://${window.location.host}/ws/exec?id=${encodeURIComponent(containerId)}&shell=${encodeURIComponent(shell)}`,
      );

      ws.onopen = () => {
        setStatus('open');
        term.focus();
        send({ type: 'resize', cols: term.cols, rows: term.rows });
      };
      ws.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : '');
      ws.onclose = () => {
        setStatus('closed');
        term.write('\r\n\x1b[90m[session closed]\x1b[0m\r\n');
      };
      ws.onerror = () => setStatus('closed');

      const send = (msg: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));
      term.onData((data: string) => send({ type: 'stdin', data }));

      const onResize = () => {
        try {
          fit.fit();
          send({ type: 'resize', cols: term.cols, rows: term.rows });
        } catch {
          /* ignore */
        }
      };
      window.addEventListener('resize', onResize);
      cleanupResize = () => window.removeEventListener('resize', onResize);
    })();

    return () => {
      disposed = true;
      cleanupResize?.();
      ws?.close();
      term?.dispose();
    };
  }, [containerId, shell, reconnectKey]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-2 text-xs text-muted">
          <span
            className={`h-2 w-2 rounded-full ${status === 'open' ? 'bg-ok' : status === 'connecting' ? 'bg-warn' : 'bg-danger'}`}
          />
          {status}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={shell}
            onChange={(e) => setShell(e.target.value)}
            className="rounded border border-border bg-bg-soft px-2 py-1 text-xs text-gray-200"
          >
            <option value="/bin/sh">/bin/sh</option>
            <option value="/bin/bash">/bin/bash</option>
            <option value="/bin/ash">/bin/ash</option>
          </select>
          <button className="btn-ghost btn-xs" onClick={() => setReconnectKey((k) => k + 1)}>
            Reconnect
          </button>
        </div>
      </div>
      <div ref={mountRef} className="h-[60vh] bg-[#0a0c11] p-2" />
    </div>
  );
}
