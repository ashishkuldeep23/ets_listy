import { beforeEach, describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/limits";
import { PRESENCE_TTL_MS, activePeople, leavePresence, resetPresenceForTests, touchPresence } from "@/lib/presence";

const asha = { name: "Asha", email: "a@example.com", guest: false };
const ravi = { name: "Ravi", email: "r@example.com", guest: false };
const guest = { name: "Guest 3FA2", email: null, guest: true };

beforeEach(() => resetPresenceForTests());

describe("presence", () => {
  it("lists everyone here, sorted by name", () => {
    touchPresence("f1", "u:2", ravi, 1000);
    touchPresence("f1", "u:1", asha, 1000);
    touchPresence("f1", "g:x", guest, 1000);
    expect(activePeople("f1", 1000).map((p) => p.name)).toEqual(["Asha", "Guest 3FA2", "Ravi"]);
  });

  it("counts the same person (two tabs) once and keeps the latest name", () => {
    touchPresence("f1", "u:1", asha, 1000);
    touchPresence("f1", "u:1", { ...asha, name: "Asha K" }, 2000);
    expect(activePeople("f1", 2000)).toEqual([{ key: "u:1", ...asha, name: "Asha K" }]);
  });

  it("drops people silent for longer than the TTL", () => {
    touchPresence("f1", "u:1", asha, 0);
    touchPresence("f1", "u:2", ravi, PRESENCE_TTL_MS);
    expect(activePeople("f1", PRESENCE_TTL_MS + 1).map((p) => p.key)).toEqual(["u:2"]);
  });

  it("removes a person who leaves", () => {
    touchPresence("f1", "u:1", asha, 0);
    leavePresence("f1", "u:1");
    leavePresence("f1", "u:unknown");
    expect(activePeople("f1", 0)).toEqual([]);
  });

  it("keeps lists apart", () => {
    touchPresence("f1", "u:1", asha, 0);
    expect(activePeople("f2", 0)).toEqual([]);
  });

  it("refuses new people once a list is full, but still refreshes those already in", () => {
    for (let i = 0; i < LIMITS.PRESENCE_PER_FOLDER; i++) touchPresence("f1", `g:${i}`, guest, 0);
    expect(touchPresence("f1", "g:new", guest, 0)).toBe(false);
    expect(touchPresence("f1", "g:0", guest, 0)).toBe(true);
  });
});
