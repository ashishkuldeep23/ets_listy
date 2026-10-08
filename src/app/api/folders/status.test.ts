import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { createUserAndCookie, json, makeRequest, routeCtx, setupTestDb } from "@/test/setup";
import type { FolderDTO, FolderListResponse } from "@/types";
import { GET as listFolders, POST as createFolder } from "@/app/api/folders/route";
import { GET as getFolder, PATCH as updateFolder } from "@/app/api/folders/[id]/route";
import { Folder } from "@/models/Folder";

setupTestDb();

const ctx = (id: string) => routeCtx({ id });
const list = async (cookie: string, query = "") => listFolders(makeRequest(`/api/folders${query}`, { cookie }));
const create = async (cookie: string, body: unknown) =>
  json<FolderDTO>(await createFolder(makeRequest("/api/folders", { method: "POST", body, cookie })));

describe("folder status", () => {
  it("defaults to active and can be set on create and update", async () => {
    const { cookie } = await createUserAndCookie();
    const a = await create(cookie, { name: "A" });
    expect(a.status).toBe("active");

    const p = await create(cookie, { name: "P", status: "pending" });
    expect(p.status).toBe("pending");

    const res = await updateFolder(
      makeRequest(`/api/folders/${a.id}`, { method: "PATCH", body: { status: "completed" }, cookie }),
      ctx(a.id)
    );
    expect((await json<FolderDTO>(res)).status).toBe("completed");

    const got = await json<FolderDTO>(await getFolder(makeRequest(`/api/folders/${a.id}`, { cookie }), ctx(a.id)));
    expect(got.status).toBe("completed");
  });

  it("rejects unknown statuses (400)", async () => {
    const { cookie } = await createUserAndCookie();
    const res = await createFolder(
      makeRequest("/api/folders", { method: "POST", body: { name: "X", status: "archived" }, cookie })
    );
    expect(res.status).toBe(400);
    expect((await list(cookie, "?status=archived")).status).toBe(400);
    expect((await list(cookie, "?status=")).status).toBe(400);
  });

  it("filters by status and counts all my folders", async () => {
    const { cookie } = await createUserAndCookie({ email: "a@example.com" });
    await create(cookie, { name: "A1" });
    await create(cookie, { name: "A2" });
    await create(cookie, { name: "P1", status: "pending" });
    await create(cookie, { name: "C1", status: "completed" });

    // Another user's folders never show up in my list or counts.
    const other = await createUserAndCookie({ email: "b@example.com" });
    await create(other.cookie, { name: "B-pending", status: "pending" });

    const pending = await json<FolderListResponse>(await list(cookie, "?status=pending"));
    expect(pending.folders.map((f) => f.name)).toEqual(["P1"]);
    expect(pending.counts).toEqual({ all: 4, active: 2, pending: 1, completed: 1 });

    const all = await json<FolderListResponse>(await list(cookie));
    expect(all.folders).toHaveLength(4);
  });

  it("treats old folders without a status as active", async () => {
    const { user, cookie } = await createUserAndCookie();
    // Simulate a folder saved before statuses existed (bypasses the schema default).
    await Folder.collection.insertOne({
      owner: new mongoose.Types.ObjectId(user.id),
      name: "Old",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const active = await json<FolderListResponse>(await list(cookie, "?status=active"));
    expect(active.folders.map((f) => f.name)).toEqual(["Old"]);
    expect(active.folders[0]?.status).toBe("active");
    expect(active.counts.active).toBe(1);
  });
});
