import { NextResponse } from 'next/server';
import { parseBody, withAuth } from '@/lib/api';
import { images } from '@/lib/resources';
import { pullImageSchema } from '@/lib/validation';
import { sseHeaders, streamToSse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  async ({ req }) => {
    const { reference } = await parseBody(req, pullImageSchema);
    const { stream } = await images.pull(reference);

    // Pull progress is newline-delimited JSON; forward complete lines.
    let buffer = '';
    const transform = (chunk: Buffer): string[] => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      return lines.map((l) => l.trim()).filter(Boolean);
    };

    const body = streamToSse(stream, { transform, signal: req.signal });
    return new NextResponse(body, { headers: sseHeaders() });
  },
  { role: 'operator' },
);
