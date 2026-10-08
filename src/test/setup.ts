import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { resetRateLimits } from "@/lib/rateLimit";
import { resetRealtimeForTests } from "@/lib/realtime";
import { POST as signup } from "@/app/api/auth/signup/route";
import type { SessionUser } from "@/types";

// Shared helpers for API tests. Call setupTestDb() at the top of a test
// file to get a fresh in-memory MongoDB, emptied before every test.

let server: MongoMemoryServer | undefined;

export function setupTestDb(): void {
  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    process.env.MONGODB_URI = server.getUri();
  });

  beforeEach(async () => {
    resetRateLimits();
    if (mongoose.connection.readyState === 1) {
      await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    globalThis._mongoose = undefined; // forget the cached connection from lib/db.ts
    await server?.stop();
  });
}

export interface RequestOptions {
  method?: string;
  /** Objects are sent as JSON; strings are sent as-is (to test bad JSON). */
  body?: unknown;
  cookie?: string | null;
  headers?: Record<string, string>;
}

/** Builds a Request for calling a route handler directly. */
export function makeRequest(path: string, { method = "GET", body, cookie, headers = {} }: RequestOptions = {}): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(cookie && { cookie }),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** The second argument Next.js passes to dynamic route handlers (params are async in v16). */
export function routeCtx<P extends Record<string, string>>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}

/** Pulls "listy_session=..." out of a response's Set-Cookie header. */
export function sessionCookieFrom(response: Response): string | null {
  const setCookie = response.headers.get("set-cookie") ?? "";
  return setCookie.match(/listy_session=[^;]*/)?.[0] ?? null;
}

/** Parses a JSON response body as `T` (tests only; no runtime checks). */
export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Signs up a user and returns { user, cookie } for authenticated requests. */
export async function createUserAndCookie({
  name = "Test User",
  email = "test@example.com",
  password = "password123",
} = {}): Promise<{ user: SessionUser; cookie: string }> {
  const res = await signup(makeRequest("/api/auth/signup", { method: "POST", body: { name, email, password } }));
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  const cookie = sessionCookieFrom(res);
  if (!cookie) throw new Error("signup did not set a session cookie");
  return { user: await json<SessionUser>(res), cookie };
}

/**
 * Turns "Pusher configured" on for each test in this file (fake keys) and
 * off afterwards. The `pusher` module itself must be mocked in the test file
 * with vi.mock, so nothing ever reaches the real service.
 */
export function withPusherEnv(): void {
  const keys = {
    PUSHER_APP_ID: "test-app",
    PUSHER_SECRET: "test-secret",
    NEXT_PUBLIC_PUSHER_KEY: "test-key",
    NEXT_PUBLIC_PUSHER_CLUSTER: "ap2",
  };
  beforeEach(() => {
    Object.assign(process.env, keys);
    resetRealtimeForTests();
  });
  afterEach(() => {
    for (const k of Object.keys(keys)) delete process.env[k];
    resetRealtimeForTests();
  });
}
