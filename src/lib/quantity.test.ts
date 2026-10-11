import { describe, it, expect } from "vitest";
import { computeTotals, lineTotal } from "@/lib/totals";
import { formatPriceLine } from "@/lib/format";
import { validateCreateItem, validateUpdateItem } from "@/lib/validators";

// Quantity: item total = price × quantity, list totals add those up.

describe("lineTotal", () => {
  it("is price × quantity, quantity missing = 1, no price = null", () => {
    expect(lineTotal({ price: 40, quantity: 2.5 })).toBe(100);
    expect(lineTotal({ price: 40, quantity: null })).toBe(40);
    expect(lineTotal({ price: 40 })).toBe(40);
    expect(lineTotal({ price: null, quantity: 3 })).toBeNull();
  });

  it("rounds to the paisa without float noise", () => {
    expect(lineTotal({ price: 0.1, quantity: 3 })).toBe(0.3);
    expect(lineTotal({ price: 33.33, quantity: 1.5 })).toBe(50);
  });
});

describe("computeTotals with quantity", () => {
  it("adds price × quantity, and remaining skips ticked items", () => {
    expect(
      computeTotals([
        { price: 40, quantity: 2, done: false }, // 80
        { price: 60, quantity: 0.5, done: true }, // 30 (ticked)
        { price: 10, done: false }, // 10 (qty 1)
        { price: null, quantity: 5, done: false }, // unpriced
      ])
    ).toEqual({ total: 120, remaining: 90, unpriced: 1 });
  });
});

describe("formatPriceLine", () => {
  it("shows unit, quantity and the item total", () => {
    expect(formatPriceLine({ price: 40, priceUnit: "kg", quantity: 2.5 }, 100)).toBe("₹40 / kg × 2.5 = ₹100");
    expect(formatPriceLine({ price: 40, priceUnit: null, quantity: null }, 40)).toBe("₹40");
    // Quantity 1 adds nothing worth showing.
    expect(formatPriceLine({ price: 40, priceUnit: "piece", quantity: 1 }, 40)).toBe("₹40 / piece");
    expect(formatPriceLine({ price: null, priceUnit: null, quantity: 3 }, null)).toBe("× 3");
    expect(formatPriceLine({ price: null, priceUnit: null, quantity: null }, null)).toBeNull();
  });
});

describe("quantity validation", () => {
  it("accepts a number above 0 (decimals ok) and null to clear", () => {
    expect(validateCreateItem({ name: "Rice", quantity: 2.5 })).toMatchObject({ ok: true, value: { fields: { quantity: 2.5 } } });
    expect(validateUpdateItem({ quantity: null })).toEqual({ ok: true, value: { quantity: null } });
  });

  it("rejects 0, negatives, strings, NaN, too big and too tiny", () => {
    for (const quantity of [0, -1, "2", Number.NaN, Infinity, 100_001, 0.0001]) {
      expect(validateCreateItem({ name: "Rice", quantity }).ok).toBe(false);
    }
  });

  it("keeps the user's own unit label as typed", () => {
    expect(validateCreateItem({ name: "Atta", price: 250, priceUnit: "5 kg bag" })).toMatchObject({
      ok: true,
      value: { fields: { priceUnit: "5 kg bag" } },
    });
  });
});
