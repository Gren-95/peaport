import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { podmanStream } from '@/lib/podman';
import { sseHeaders, streamToSse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ params, req }) => {
  const id = params.id!;
  const { stream } = await podmanStream(`/containers/${encodeURIComponent(id)}/stats`, {
    query: { stream: true },
  });

  // The stats endpoint emits one JSON object per chunk/line. Forward complete
  // JSON lines; buffer partial ones.
  let buffer = '';
  const transform = (chunk: Buffer): string[] => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    return lines.map((l) => l.trim()).filter(Boolean);
  };

  const body = streamToSse(stream, { transform, signal: req.signal });
  return new NextResponse(body, { headers: sseHeaders() });
});
