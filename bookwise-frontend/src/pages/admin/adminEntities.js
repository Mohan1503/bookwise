/**
 * Field configuration for the shared authors / categories / publishers
 * manager. Each maps 1:1 to the backend admin schema for that entity.
 */
export const ADMIN_ENTITIES = {
  authors: {
    singular: 'author',
    plural: 'Authors',
    lead: 'People credited on your books. Deleting an author removes them from those books.',
    fields: [
      { name: 'bio', label: 'Short bio', type: 'textarea', maxLength: 2000 },
    ],
    summary: (item) => item.bio,
  },
  categories: {
    singular: 'category',
    plural: 'Categories',
    lead: 'Collections readers browse in the store. Deleting a category unlinks its books; the books stay.',
    fields: [
      { name: 'description', label: 'Description', type: 'textarea', maxLength: 1000 },
    ],
    summary: (item) => item.description,
  },
  publishers: {
    singular: 'publisher',
    plural: 'Publishers',
    lead: 'Publishing houses for your books. Deleting a publisher keeps its books, without a publisher.',
    fields: [
      { name: 'website', label: 'Website', type: 'url', maxLength: 255, placeholder: 'https://' },
      { name: 'description', label: 'Description', type: 'textarea', maxLength: 1000 },
    ],
    summary: (item) => item.website || item.description,
  },
};
