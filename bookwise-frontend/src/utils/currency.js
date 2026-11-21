/** BookWise prices are stored and shown in Indian rupees (INR). */
export const CURRENCY_SYMBOL = '₹';

const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const withPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a price as rupees with Indian digit grouping: ₹1,599 or ₹1,599.50. */
export function formatPrice(value) {
  const amount = Number(value) || 0;
  return Number.isInteger(amount) ? wholeRupees.format(amount) : withPaise.format(amount);
}
