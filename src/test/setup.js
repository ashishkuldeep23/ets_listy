import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { resetRateLimits } from "@/lib/rateLimit";
import { POST as signup } from "@/app/api/auth/signup/route";

// Shared helpers for API tests. Call setupTestDb() at the top of a test
// file to get a fresh in-memory MongoDB, emptied before every test.

let server;

export function setupTestDb() {
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
    globalThis._mongoose = undefined; // forget the cached connection from lib/db.js
    await server?.stop();
  });
}

/** Builds a Request for calling a route handler directly. */
export function makeRequest(path, { method = "GET", body, cookie, headers = {} } = {}) {
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

/** Pulls "listy_session=..." out of a response's Set-Cookie header. */
export function sessionCookieFrom(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/listy_session=[^;]*/);
  return match ? match[0] : null;
}

/** Signs up a user and returns { user, cookie } for authenticated requests. */
export async function createUserAndCookie({ name = "Test User", email = "test@example.com", password = "password123" } = {}) {
  const res = await signup(makeRequest("/api/auth/signup", { method: "POST", body: { name, email, password } }));
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  return { user: await res.json(), cookie: sessionCookieFrom(res) };
}
