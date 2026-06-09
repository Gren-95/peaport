/**
 * Helper for building Server-Sent Events responses backed by an upstream
 * Node Readable (used for log following and stats streaming).
 */
import type { Readable } from 'node:stream';

const encoder = new TextEncoder();

export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

interface SseOptions {
  /** Convert a raw upstream chunk into zero or more SSE message payloads. */
  transform: (chunk: Buffer) => string[];
  /** Abort signal from the client request. */
  signal: AbortSignal;
  /** Optional event name for emitted messages. */
  event?: string;
}

/** Wrap an upstream Node stream as a browser-consumable SSE ReadableStream. */
export function streamToSse(upstream: Readable, options: SseOptions): ReadableStream<Uint8Array> {
  const { transform, signal, event } = options;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        upstream.destroy();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const send = (payload: string) => {
        if (closed) return;
        const prefix = event ? `event: ${event}\n` : '';
        const body = payload
          .split('\n')
          .map((line) => `data: ${line}`)
          .join('\n');
        controller.enqueue(encoder.encode(`${prefix}${body}\n\n`));
      };

      // Initial comment so the client connection opens immediately.
      controller.enqueue(encoder.encode(': connected\n\n'));
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': ping\n\n'));
      }, 25_000);
      if ('unref' in heartbeat) (heartbeat as { unref: () => void }).unref();

      upstream.on('data', (chunk: Buffer) => {
        for (const message of transform(chunk)) send(message);
      });
      upstream.on('end', () => {
        clearInterval(heartbeat);
        close();
      });
      upstream.on('error', () => {
        clearInterval(heartbeat);
        close();
      });

      signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        close();
      });
    },
    cancel() {
      upstream.destroy();
    },
  });
}
