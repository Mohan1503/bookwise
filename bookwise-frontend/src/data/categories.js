/**
 * Category metadata for the storefront.
 *
 * `icon` holds the Lucide React component name used to render the icon, and
 * `image` holds a representative cover used on the browse-by-category strip.
 * Category ids match the `category` values stored on each book in books.js.
 */

export const categories = [
  {
    id: 'fiction',
    name: 'Fiction',
    description: 'Stories, novels and imagined worlds to disappear into.',
    icon: 'BookOpen',
    image: 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg',
  },
  {
    id: 'personal-development',
    name: 'Personal Development',
    description: 'Practical habits and frameworks for becoming your best self.',
    icon: 'Sparkles',
    image: 'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg',
  },
  {
    id: 'technology',
    name: 'Technology',
    description: 'Engineering, software craft and the tools shaping our future.',
    icon: 'Cpu',
    image: 'https://covers.openlibrary.org/b/isbn/9780135957059-L.jpg',
  },
  {
    id: 'business',
    name: 'Business',
    description: 'Strategy, startups and the thinking behind great companies.',
    icon: 'Briefcase',
    image: 'https://covers.openlibrary.org/b/isbn/9780804139298-L.jpg',
  },
  {
    id: 'psychology',
    name: 'Psychology',
    description: 'How the mind works, from behaviour to decision making.',
    icon: 'Brain',
    image: 'https://covers.openlibrary.org/b/isbn/9780374533557-L.jpg',
  },
  {
    id: 'science',
    name: 'Science',
    description: 'Big ideas about the universe, life and everything between.',
    icon: 'Microscope',
    image: 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg',
  },
  {
    id: 'biography',
    name: 'Biography',
    description: 'True stories of lives that changed the way we see the world.',
    icon: 'Feather',
    image: 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg',
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Money, markets and the psychology of building wealth.',
    icon: 'PiggyBank',
    image: 'https://covers.openlibrary.org/b/isbn/9780857197689-L.jpg',
  },
];

/** Look up a single category by id or by display name. */
export function getCategoryById(idOrName) {
  if (!idOrName) return null;
  const needle = String(idOrName).toLowerCase();
  return (
    categories.find(
      (category) =>
        category.id.toLowerCase() === needle || category.name.toLowerCase() === needle,
    ) ?? null
  );
}

/** The "All" pseudo-category used by storefront filters. */
export const ALL_CATEGORY = 'All';
