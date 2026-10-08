import { describe, it, expect } from "vitest";
import { computeTotals, groupItems, UNGROUPED } from "@/lib/totals";

describe("computeTotals", () => {
  it("sums all priced items and the unticked ones separately", () => {
    expect(
      computeTotals([
        { price: 60, done: true },
        { price: 40.5, done: false },
        { price: null, done: false },
        { price: 0, done: false },
      ])
    ).toEqual({ total: 100.5, remaining: 40.5, unpriced: 1 });
  });

  it("has no floating point noise", () => {
    expect(computeTotals([{ price: 0.1, done: false }, { price: 0.2, done: false }]).total).toBe(0.3);
  });

  it("handles an empty list", () => {
    expect(computeTotals([])).toEqual({ total: 0, remaining: 0, unpriced: 0 });
  });
});

describe("groupItems", () => {
  it("sorts groups A–Z, keeps item order, and puts ungrouped last", () => {
    const items = [
      { name: "a", group: null },
      { name: "b", group: "Veg" },
      { name: "c", group: "Dairy" },
      { name: "d", group: "Veg" },
    ];
    const grouped = groupItems(items);
    expect(grouped.map(([g]) => g)).toEqual(["Dairy", "Veg", UNGROUPED]);
    expect(grouped[1]?.[1].map((i) => i.name)).toEqual(["b", "d"]);
  });
});
