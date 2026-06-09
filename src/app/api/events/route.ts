import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { podmanStream } from '@/lib/podman';
import { sseHeaders, streamToSse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stream the engine event feed (newline-delimited JSON) as SSE.
export const GET = withAuth(async ({ req }) => {
  const { stream } = await podmanStream('/events', {});

  let buffer = '';
  const transform = (chunk: Buffer): string[] => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    return lines.map((l) => l.trim()).filter(Boolean);
  };

  return new NextResponse(streamToSse(stream, { transform, signal: req.signal }), { headers: sseHeaders() });
});
