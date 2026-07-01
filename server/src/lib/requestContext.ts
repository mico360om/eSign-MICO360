import { AsyncLocalStorage } from "async_hooks";

// Per-request context so cross-cutting code (e.g. the audit logger) can read the
// caller's IP and device without threading them through every function call.
export interface ReqCtx {
  ip?: string;
  device?: string;
}

export const requestContext = new AsyncLocalStorage<ReqCtx>();

export function getReqCtx(): ReqCtx {
  return requestContext.getStore() ?? {};
}
