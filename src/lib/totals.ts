// Price totals for a folder's items. Pure, so the UI and tests share it.

export interface PricedItem {
  price: number | null;
  done: boolean;
}

export interface Totals {
  /** Sum of every item that has a price. */
  total: number;
  /** Sum of items still to get (not ticked) that have a price. */
  remaining: number;
  /** How many items have no price (left out of both sums). */
  unpriced: number;
}

// Sums in paise (whole numbers) so 0.1 + 0.2 doesn't turn into 0.30000000000000004.
const toPaise = (rupees: number) => Math.round(rupees * 100);

export function computeTotals(items: readonly PricedItem[]): Totals {
  let total = 0;
  let remaining = 0;
  let unpriced = 0;
  for (const item of items) {
    if (item.price === null) {
      unpriced += 1;
      continue;
    }
    total += toPaise(item.price);
    if (!item.done) remaining += toPaise(item.price);
  }
  return { total: total / 100, remaining: remaining / 100, unpriced };
}

/** Section key for items without a group. */
export const UNGROUPED = "";

/**
 * Splits items into sections by group, keeping each item's order.
 * Named groups are sorted A–Z; "Ungrouped" (key "") comes last.
 */
export function groupItems<T extends { group: string | null }>(items: readonly T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.group ?? UNGROUPED;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()].sort(([a], [b]) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    return a.localeCompare(b);
  });
}
