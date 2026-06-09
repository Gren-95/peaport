'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';

export default function LogViewer({ containerId }: { containerId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [following, setFollowing] = useState(true);
  const [connected, setConnected] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(following);
  followRef.current = following;

  useEffect(() => {
    const source = new EventSource(`/api/containers/${containerId}/logs?tail=500`);
    source.onopen = () => setConnected(true);
    source.onmessage = (e) => {
      setLines((prev) => {
        const next = [...prev, e.data];
        return next.length > 5000 ? next.slice(next.length - 5000) : next;
      });
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [containerId]);

  useEffect(() => {
    if (followRef.current && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-ok' : 'bg-danger'}`} />
          {connected ? 'streaming' : 'disconnected'} · {lines.length} lines
        </span>
        <div className="flex gap-2">
          <button className="btn-ghost btn-xs" onClick={() => setFollowing((f) => !f)}>
            {following ? <Pause size={13} /> : <Play size={13} />}
            {following ? 'Pause scroll' : 'Follow'}
          </button>
          <button className="btn-ghost btn-xs" onClick={() => setLines([])}>
            <Trash2 size={13} /> Clear
          </button>
        </div>
      </div>
      <div
        ref={boxRef}
        className="h-[60vh] overflow-auto bg-[#0a0c11] px-3 py-2 font-mono text-xs leading-relaxed text-gray-300"
      >
        {lines.length === 0 ? (
          <span className="text-muted">Waiting for log output…</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
