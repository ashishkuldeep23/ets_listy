import { describe, it, expect } from "vitest";
import { createUserAndCookie, json, makeRequest, setupTestDb } from "@/test/setup";
import { GET as searchUsers } from "@/app/api/users/search/route";
import { LIMITS } from "@/lib/limits";
import { User } from "@/models/User";
import type { UserSearchResponse } from "@/types";

setupTestDb();

// Suggestions for the "Invite a person" box.

const search = (q: string, cookie?: string) =>
  searchUsers(makeRequest(`/api/users/search?q=${encodeURIComponent(q)}`, { cookie }));
const found = async (q: string, cookie: string) => (await json<UserSearchResponse>(await search(q, cookie))).users;

describe("GET /api/users/search", () => {
  it("needs a login", async () => {
    expect((await search("ra")).status).toBe(401);
  });

  it("finds users by the start of their email or of a word in their name", async () => {
    const me = await createUserAndCookie({ name: "Asha", email: "asha@example.com" });
    await createUserAndCookie({ name: "Ravi Kumar", email: "ravi@example.com" });
    await createUserAndCookie({ name: "Priya", email: "kumari.p@example.com" });

    expect((await found("ravi", me.cookie)).map((u) => u.name)).toEqual(["Ravi Kumar"]);
    // "kum" matches the 2nd word of a name and the start of an email.
    expect((await found("kum", me.cookie)).map((u) => u.name).sort()).toEqual(["Priya", "Ravi Kumar"]);
    // Case doesn't matter.
    expect((await found("RAVI@EX", me.cookie)).map((u) => u.email)).toEqual(["ravi@example.com"]);
  });

  it("returns id, name and email only (no password hash)", async () => {
    const me = await createUserAndCookie({ name: "Asha", email: "asha@example.com" });
    await createUserAndCookie({ name: "Ravi", email: "ravi@example.com" });
    const [u] = await found("ravi", me.cookie);
    expect(Object.keys(u ?? {}).sort()).toEqual(["email", "id", "name"]);
  });

  it("does not match in the middle of an email or word", async () => {
    const me = await createUserAndCookie({ name: "Asha", email: "asha@example.com" });
    await createUserAndCookie({ name: "Ravi", email: "ravi@example.com" });
    expect(await found("example", me.cookie)).toEqual([]);
    expect(await found("avi", me.cookie)).toEqual([]);
  });

  it("never suggests me", async () => {
    const me = await createUserAndCookie({ name: "Asha", email: "asha@example.com" });
    expect(await found("asha", me.cookie)).toEqual([]);
  });

  it("needs a few characters, and treats regex characters literally", async () => {
    const me = await createUserAndCookie({ name: "Asha", email: "asha@example.com" });
    await createUserAndCookie({ name: "Ravi", email: "ravi@example.com" });
    expect(await found("r", me.cookie)).toEqual([]);
    expect(await found("   ", me.cookie)).toEqual([]);
    expect(await found(".*", me.cookie)).toEqual([]);
    expect((await search("(((", me.cookie)).status).toBe(200);
  });

  it(`returns at most ${LIMITS.USER_SEARCH_RESULTS} users`, async () => {
    const me = await createUserAndCookie({ name: "Asha", email: "asha@example.com" });
    // Straight into the DB: signup itself is rate-limited.
    await User.insertMany(
      Array.from({ length: LIMITS.USER_SEARCH_RESULTS + 2 }, (_, i) => ({
        name: `Sam ${i}`,
        email: `sam${i}@example.com`,
        passwordHash: "x",
      }))
    );
    expect(await found("sam", me.cookie)).toHaveLength(LIMITS.USER_SEARCH_RESULTS);
  });

  it("is rate-limited per user", async () => {
    const me = await createUserAndCookie({ name: "Asha", email: "asha@example.com" });
    let last = 200;
    for (let i = 0; i < 301; i++) last = (await search("ra", me.cookie)).status;
    expect(last).toBe(429);
  });
});
