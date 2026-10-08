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
