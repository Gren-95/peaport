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
  labels: z.record(z.string()).optional(),
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
