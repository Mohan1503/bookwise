/**
 * Shared navigation configuration.
 *
 * The navbar renders `primaryLinks`, the footer renders `footerColumns`.
 * Icon names map to Lucide React components and are resolved in the
 * components themselves so this file stays free of JSX.
 */

export const primaryLinks = [
  { label: 'Home', to: '/', icon: 'Home' },
  { label: 'Explore Books', to: '/books', icon: 'Compass' },
  { label: 'Categories', to: '/categories', icon: 'LayoutGrid' },
  { label: 'AI Reader', to: '/ai-reader', icon: 'Sparkles' },
];

export const accountLinks = [
  { label: 'Wishlist', to: '/wishlist', icon: 'Heart' },
  { label: 'Cart', to: '/cart', icon: 'ShoppingBag' },
  { label: 'Profile', to: '/profile', icon: 'User' },
];

export const footerColumns = [
  {
    title: 'Explore',
    links: [
      { label: 'Home', to: '/' },
      { label: 'All Books', to: '/books' },
      { label: 'Categories', to: '/categories' },
      { label: 'AI Reader', to: '/ai-reader' },
      { label: 'Wishlist', to: '/wishlist' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Login', to: '/login' },
      { label: 'Sign up', to: '/signup' },
      { label: 'Profile', to: '/profile' },
      { label: 'Cart', to: '/cart' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help centre', to: '/books' },
      { label: 'Shipping & delivery', to: '/books' },
      { label: 'Returns policy', to: '/books' },
      { label: 'Contact us', to: '/books' },
    ],
  },
];

export const legalLinks = [
  { label: 'Privacy policy', to: '/books' },
  { label: 'Terms of service', to: '/books' },
  { label: 'Cookie settings', to: '/books' },
];
