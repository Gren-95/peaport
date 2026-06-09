/**
 * Thin service layer over the engine API, grouped by resource. Route handlers
 * call these; they keep endpoint paths and query-building in one place.
 */
import { podmanRequest, podmanStream } from '@/lib/podman';
import type { ContainerSummary } from '@/types';

export type ContainerAction = 'start' | 'stop' | 'restart' | 'kill' | 'pause' | 'unpause';
const CONTAINER_ACTIONS: ContainerAction[] = ['start', 'stop', 'restart', 'kill', 'pause', 'unpause'];
export function isContainerAction(value: string): value is ContainerAction {
  return (CONTAINER_ACTIONS as string[]).includes(value);
}

export type PodAction = 'start' | 'stop' | 'restart' | 'pause' | 'unpause';
const POD_ACTIONS: PodAction[] = ['start', 'stop', 'restart', 'pause', 'unpause'];
export function isPodAction(value: string): value is PodAction {
  return (POD_ACTIONS as string[]).includes(value);
}

// --- containers -------------------------------------------------------------

export const containers = {
  list: (all = true) => podmanRequest<ContainerSummary[]>('/containers/json', { query: { all } }),
  inspect: (id: string) => podmanRequest(`/containers/${encodeURIComponent(id)}/json`),
  top: (id: string) => podmanRequest(`/containers/${encodeURIComponent(id)}/top`),
  action: (id: string, action: ContainerAction) =>
    podmanRequest(`/containers/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
  remove: (id: string, force: boolean, volumes: boolean) =>
    podmanRequest(`/containers/${encodeURIComponent(id)}`, { method: 'DELETE', query: { force, v: volumes } }),
};

// --- images -----------------------------------------------------------------

export const images = {
  list: () => podmanRequest('/images/json', { query: { all: false } }),
  inspect: (id: string) => podmanRequest(`/images/${encodeURIComponent(id)}/json`),
  remove: (id: string, force: boolean) =>
    podmanRequest(`/images/${encodeURIComponent(id)}`, { method: 'DELETE', query: { force } }),
  prune: () => podmanRequest('/images/prune', { method: 'POST' }),
  /** Returns the streaming pull progress (newline-delimited JSON). */
  pull: (reference: string) => {
    const [fromImage, tag] = splitReference(reference);
    return podmanStream('/images/create', { method: 'POST', query: { fromImage, tag } });
  },
};

function splitReference(reference: string): [string, string] {
  // Keep a port in the registry host (host:5000/img:tag) out of the tag split.
  const lastColon = reference.lastIndexOf(':');
  const lastSlash = reference.lastIndexOf('/');
  if (lastColon > lastSlash) {
    return [reference.slice(0, lastColon), reference.slice(lastColon + 1)];
  }
  return [reference, 'latest'];
}

// --- volumes ----------------------------------------------------------------

export const volumes = {
  list: () => podmanRequest('/volumes'),
  inspect: (name: string) => podmanRequest(`/volumes/${encodeURIComponent(name)}`),
  create: (body: { Name: string; Driver?: string; Labels?: Record<string, string> }) =>
    podmanRequest('/volumes/create', { method: 'POST', body }),
  remove: (name: string, force: boolean) =>
    podmanRequest(`/volumes/${encodeURIComponent(name)}`, { method: 'DELETE', query: { force } }),
  prune: () => podmanRequest('/volumes/prune', { method: 'POST' }),
};

// --- networks ---------------------------------------------------------------

export const networks = {
  list: () => podmanRequest('/networks'),
  inspect: (id: string) => podmanRequest(`/networks/${encodeURIComponent(id)}`),
  create: (body: { Name: string; Driver?: string; Internal?: boolean }) =>
    podmanRequest('/networks/create', { method: 'POST', body }),
  remove: (id: string) => podmanRequest(`/networks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  prune: () => podmanRequest('/networks/prune', { method: 'POST' }),
};

// --- pods (libpod / Podman only) -------------------------------------------

export const pods = {
  list: () => podmanRequest('/pods/json', { libpod: true }),
  inspect: (id: string) => podmanRequest(`/pods/${encodeURIComponent(id)}/json`, { libpod: true }),
  action: (id: string, action: PodAction) =>
    podmanRequest(`/pods/${encodeURIComponent(id)}/${action}`, { method: 'POST', libpod: true }),
  remove: (id: string, force: boolean) =>
    podmanRequest(`/pods/${encodeURIComponent(id)}`, { method: 'DELETE', query: { force }, libpod: true }),
};

// --- system -----------------------------------------------------------------

export const system = {
  info: () => podmanRequest('/info'),
  version: () => podmanRequest('/version'),
  df: () => podmanRequest('/system/df'),
};
