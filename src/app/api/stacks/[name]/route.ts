import { ApiException, ok, parseBody, withAuth } from '@/lib/api';
import { deleteStack, getStack, runComposeWait, saveStack } from '@/lib/compose';
import { containers } from '@/lib/resources';
import { updateStackSchema } from '@/lib/validation';
import type { ContainerSummary } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECT_LABEL = 'com.docker.compose.project';

export const GET = withAuth(async ({ params }) => {
  const stack = getStack(params.name!);
  if (!stack) throw new ApiException('NOT_FOUND', 'Stack not found.', 404);
  const all = (await containers.list(true).catch(() => [])) as ContainerSummary[];
  const stackContainers = all.filter((c) => c.Labels?.[PROJECT_LABEL] === stack.name);
  return ok({ stack, containers: stackContainers });
});

export const PUT = withAuth(
  async ({ params, req }) => {
    const stack = getStack(params.name!);
    if (!stack) throw new ApiException('NOT_FOUND', 'Stack not found.', 404);
    const { content } = await parseBody(req, updateStackSchema);
    return ok({ stack: saveStack(params.name!, content, stack.createdBy) });
  },
  { role: 'operator' },
);

export const DELETE = withAuth(
  async ({ params, req }) => {
    const name = params.name!;
    if (!getStack(name)) throw new ApiException('NOT_FOUND', 'Stack not found.', 404);
    const removeVolumes = req.nextUrl.searchParams.get('volumes') === 'true';
    // Tear down the stack's resources before removing the definition.
    const { code, output } = await runComposeWait(name, 'down', { removeVolumes });
    deleteStack(name);
    return ok({ removed: true, downExitCode: code, output: output.slice(-4000) });
  },
  { role: 'admin' },
);
