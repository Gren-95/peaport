/** Zod schemas for request validation. */
import { z } from 'zod';
import { ROLES } from '@/types';

const username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(32, 'Username must be at most 32 characters.')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, and . _ -');

const password = z.string().min(8, 'Password must be at least 8 characters.').max(256);
const role = z.enum(ROLES as [string, ...string[]]);

export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const createUserSchema = z.object({
  username,
  password,
  role,
});

export const updateUserSchema = z
  .object({
    role: role.optional(),
    password: password.optional(),
  })
  .refine((v) => v.role !== undefined || v.password !== undefined, {
    message: 'Provide at least one field to update.',
  });

export const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const pullImageSchema = z.object({
  reference: z.string().trim().min(1, 'Image reference is required.').max(512),
});

export const createVolumeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Invalid volume name.'),
  driver: z.string().trim().max(64).optional(),
  labels: z.record(z.string(), z.string()).optional(),
});

export const createNetworkSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Invalid network name.'),
  driver: z.string().trim().max(64).optional(),
  internal: z.boolean().optional(),
});

export const execSchema = z.object({
  cmd: z.array(z.string()).min(1).max(64),
});

export const createContainerSchema = z.object({
  image: z.string().trim().min(1, 'Image is required.').max(512),
  name: z
    .string()
    .trim()
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Invalid container name.')
    .optional()
    .or(z.literal('')),
  command: z.string().max(4000).optional(),
  env: z.array(z.string().max(4000)).max(200).optional(),
  ports: z.array(z.string().trim().max(64)).max(100).optional(),
  volumes: z.array(z.string().trim().max(512)).max(100).optional(),
  network: z.string().trim().max(128).optional(),
  restartPolicy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']).optional(),
  tty: z.boolean().optional(),
  privileged: z.boolean().optional(),
  autoRemove: z.boolean().optional(),
  start: z.boolean().optional(),
});

// Compose project names must be lowercase and start with a letter or digit.
const stackName = z
  .string()
  .trim()
  .min(1, 'Stack name is required.')
  .max(63)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use lowercase letters, digits, "-" and "_"; must start alphanumeric.');

export const createStackSchema = z.object({
  name: stackName,
  content: z.string().min(1, 'Compose file content is required.').max(512_000),
});

export const updateStackSchema = z.object({
  content: z.string().min(1, 'Compose file content is required.').max(512_000),
});

export const setSecretSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Secret name is required.')
    .max(128)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use an environment-variable style name (letters, digits, underscore).'),
  value: z.string().min(1, 'Secret value is required.').max(64_000),
});
