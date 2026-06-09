import { ApiException, ok, parseBody, withAuth } from '@/lib/api';
import { getStack, listStacks, saveStack } from '@/lib/compose';
import { containers } from '@/lib/resources';
import { createStackSchema } from '@/lib/validation';
import type { ContainerSummary, Stack, StackStatus } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECT_LABEL = 'com.docker.compose.project';
const SERVICE_LABEL = 'com.docker.compose.service';

function computeStatus(stack: Stack, all: ContainerSummary[]): StackStatus {
  const mine = all.filter((c) => c.Labels?.[PROJECT_LABEL] === stack.name);
  const services = [...new Set(mine.map((c) => c.Labels?.[SERVICE_LABEL]).filter(Boolean) as string[])];
  const running = mine.filter((c) => c.State === 'running').length;
  const total = mine.length;
  let state: StackStatus['state'] = 'inactive';
  if (total > 0) state = running === total ? 'running' : running > 0 ? 'partial' : 'stopped';
  return { ...stack, services, running, total, state };
}

export const GET = withAuth(async () => {
  const stacks = listStacks();
  const all = (await containers.list(true).catch(() => [])) as ContainerSummary[];
  return ok({ stacks: stacks.map((s) => computeStatus(s, all)) });
});

export const POST = withAuth(
  async ({ req, user }) => {
    const { name, content } = await parseBody(req, createStackSchema);
    if (getStack(name)) {
      throw new ApiException('ALREADY_EXISTS', `A stack named "${name}" already exists.`, 409);
    }
    const stack = saveStack(name, content, user.username);
    return ok({ stack }, { status: 201 });
  },
  { role: 'operator' },
);
