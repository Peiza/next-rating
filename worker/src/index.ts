/*
 * The Worker's entry point. The session and the memory cache live in this
 * isolate only and disappear when Cloudflare recycles it.
 */

import { createState, handle, type EdgeCache, type Env } from './handler';

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const state = createState();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const edgeCache = (globalThis.caches as unknown as { default?: EdgeCache } | undefined)?.default ?? null;
    return handle(request, env, {
      fetch: (input, init) => fetch(input, init),
      now: () => Date.now(),
      state,
      edgeCache,
      waitUntil: (promise) => ctx.waitUntil(promise),
    });
  },
};
