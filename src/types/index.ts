/** Shared application types used across API routes and the client. */

export type Role = 'admin' | 'operator' | 'viewer';

/**
 * Role capabilities:
 *  - viewer:   read-only access to all resources (list, inspect, logs, stats)
 *  - operator: viewer + lifecycle actions (start/stop/restart/exec, pull, prune)
 *  - admin:    operator + destructive actions (remove/delete) + user management
 */
export const ROLES: Role[] = ['admin', 'operator', 'viewer'];

export interface User {
  id: number;
  username: string;
  role: Role;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
  mustChangePassword: boolean;
}

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

export interface Stack {
  name: string;
  content: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StackStatus extends Stack {
  /** Distinct services seen among the stack's containers. */
  services: string[];
  running: number;
  total: number;
  state: 'running' | 'partial' | 'stopped' | 'inactive';
}

/** Trimmed container shape returned by the compat /containers/json endpoint. */
export interface ContainerSummary {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  State: string;
  Status: string;
  Ports: Array<{ PrivatePort?: number; PublicPort?: number; Type?: string; IP?: string }>;
  Labels: Record<string, string>;
  Pod?: string;
}
