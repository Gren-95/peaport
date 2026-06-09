import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { containers } from '@/lib/resources';
import { podmanStream } from '@/lib/podman';
import { sseHeaders, streamToSse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface InspectResult {
  Config?: { Tty?: boolean };
}

export const GET = withAuth(async ({ params, req }) => {
  const id = params.id!;
  const tail = req.nextUrl.searchParams.get('tail') ?? '200';
  const timestamps = req.nextUrl.searchParams.get('timestamps') === 'true';

  const inspect = (await containers.inspect(id)) as InspectResult;
  const hasTty = Boolean(inspect.Config?.Tty);

  const { stream } = await podmanStream(`/containers/${encodeURIComponent(id)}/logs`, {
    query: { follow: true, stdout: true, stderr: true, tail, timestamps },
  });

  // Non-TTY log streams use 8-byte multiplexing headers; strip them. TTY
  // streams are raw text. Buffer partial frames/lines across chunks.
  let buffer = Buffer.alloc(0);

  const transform = (chunk: Buffer): string[] => {
    buffer = Buffer.concat([buffer, chunk]);
    let text = '';

    if (hasTty) {
      text = buffer.toString('utf8');
      buffer = Buffer.alloc(0);
    } else {
      let offset = 0;
      while (offset + 8 <= buffer.length) {
        const size = buffer.readUInt32BE(offset + 4);
        if (offset + 8 + size > buffer.length) break;
        text += buffer.subarray(offset + 8, offset + 8 + size).toString('utf8');
        offset += 8 + size;
      }
      buffer = buffer.subarray(offset);
    }

    if (!text) return [];
    return text.split(/\r?\n/).filter((line) => line.length > 0);
  };

  const body = streamToSse(stream, { transform, signal: req.signal });
  return new NextResponse(body, { headers: sseHeaders() });
});
