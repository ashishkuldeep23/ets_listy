// Display helpers shared by components.

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** 1234.5 → "₹1,234.5" (Indian digit grouping). */
export function formatRupees(amount: number): string {
  return rupees.format(amount);
}

/** 40, "kg" → "₹40 / kg"; no unit → just "₹40". */
export function formatPrice(price: number, unit: string | null): string {
  return unit ? `${formatRupees(price)} / ${unit}` : formatRupees(price);
}

const quantityFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/** 2.5 → "2.5", 1000 → "1,000". */
export function formatQuantity(quantity: number): string {
  return quantityFormat.format(quantity);
}

/**
 * The price line of an item row:
 *   price + unit + qty → "₹40 / kg × 2.5 = ₹100"
 *   price only         → "₹40"
 *   qty only           → "× 3"
 *   nothing            → null
 * `total` is price × quantity (see lib/totals.ts lineTotal).
 */
export function formatPriceLine(
  item: { price: number | null; priceUnit: string | null; quantity: number | null },
  total: number | null
): string | null {
  const qty = item.quantity !== null && item.quantity !== 1 ? `× ${formatQuantity(item.quantity)}` : "";
  if (item.price === null) return qty || null;
  const each = formatPrice(item.price, item.priceUnit);
  return qty && total !== null ? `${each} ${qty} = ${formatRupees(total)}` : each;
}
