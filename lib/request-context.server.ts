/**
 * Request-context plumbing (SERVER ONLY).
 *
 * Isolated from lib/logger.ts so client-transitive modules never pull
 * `node:async_hooks` into the browser bundle (Turbopack panics on that).
 * The storage instance is published on globalThis so logger.ts can read
 * the current request id without importing anything Node-specific.
 */

import { AsyncLocalStorage } from "node:async_hooks";

interface RequestStorage {
  getStore?: () => { requestId: string } | undefined;
  // node:async_hooks signature
  run: <T>(store: { requestId: string }, fn: () => T) => T;
}

const globalForRequestCtx = globalThis as unknown as {
  __obligorRequestStorage?: RequestStorage;
};

const storage = new AsyncLocalStorage<{ requestId: string }>();
globalForRequestCtx.__obligorRequestStorage = storage as unknown as RequestStorage;

export function withRequestContext<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
