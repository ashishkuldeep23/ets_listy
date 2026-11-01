// Browser stand-ins for tests of the offline sync code, which runs in the
// browser: a `window` with an in-memory localStorage, and a fake API.

import { vi } from "vitest";
import { MemoryStorage } from "@/test/memoryStorage";

export interface FakeCall {
  method: string;
  url: string;
  body: unknown;
}

/**
 * Stubs `window` (localStorage + dispatchEvent). Returns the storage and
 * the details of every CustomEvent dispatched. Undo with vi.unstubAllGlobals().
 */
export function stubBrowser() {
  const storage = new MemoryStorage();
  const events: unknown[] = [];
  vi.stubGlobal("window", {
    localStorage: storage,
    dispatchEvent: (e: Event) => {
      if (e instanceof CustomEvent) events.push(e.detail);
      return true;
    },
  });
  return { storage, events };
}

/** A fake API: `reply` answers each request with [status, body], or throws for "no network". Returns the calls made. */
export function fakeServer(reply: (call: FakeCall) => [number, unknown]): FakeCall[] {
  const calls: FakeCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { method: init.method ?? "GET", url, body: init.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      const [status, body] = reply(call);
      return new Response(status === 204 ? null : JSON.stringify(body), { status });
    })
  );
  return calls;
}

/** Use as a fakeServer reply: the request fails like it does with no network. */
export const noNetwork = (): never => {
  throw new TypeError("Failed to fetch");
};
