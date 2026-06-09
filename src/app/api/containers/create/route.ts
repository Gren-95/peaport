import { z } from 'zod';
import { ApiException, ok, parseBody, withAuth } from '@/lib/api';
import { containers } from '@/lib/resources';
import { buildCreatePayload, SpecError, type CreateContainerInput } from '@/lib/containerSpec';
import { createContainerSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateBody = z.infer<typeof createContainerSchema>;

export const POST = withAuth(
  async ({ req }) => {
    const body = await parseBody<CreateBody>(req, createContainerSchema);

    let payload: Record<string, unknown>;
    try {
      payload = buildCreatePayload(body as CreateContainerInput);
    } catch (err) {
      if (err instanceof SpecError) throw new ApiException('VALIDATION_ERROR', err.message, 422);
      throw err;
    }

    const created = await containers.create(body.name || undefined, payload);

    let started = false;
    if (body.start) {
      await containers.action(created.Id, 'start');
      started = true;
    }
    return ok({ id: created.Id, started }, { status: 201 });
  },
  { role: 'operator' },
);
