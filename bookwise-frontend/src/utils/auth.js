export const STORAGE_KEYS = {
  session: 'bookwise.session',
  cart: 'bookwise.cart',
};

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email ?? '').trim());
}
