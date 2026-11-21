/**
 * Sample reader testimonials shown on the landing page.
 * Placeholder marketing copy for the frontend-only stage.
 */

export const testimonials = [
  {
    id: 't1',
    name: 'Priya Raghunathan',
    role: 'Product Designer, Bengaluru',
    rating: 5,
    text: 'The AI Reader changed how I finish books. I ask it for the three ideas that actually matter and it pulls them out in under a minute. My reading list finally feels manageable.',
  },
  {
    id: 't2',
    name: 'Daniel Okonkwo',
    role: 'Software Engineer, Toronto',
    rating: 5,
    text: 'I have tried a dozen reading apps and this is the first one that stays out of the way. Clean catalogue, quick checkout, and the category browsing is genuinely good.',
  },
  {
    id: 't3',
    name: 'Marta Kowalczyk',
    role: 'PhD Candidate, Warsaw',
    rating: 4,
    text: 'I use BookWise for the classics I keep meaning to finish. The wishlist and the reading stats keep me honest, and the mobile experience is seamless.',
  },
  {
    id: 't4',
    name: 'Samuel Adeyemi',
    role: 'Founder, Lagos',
    rating: 5,
    text: 'As a founder I buy a lot of business books and barely finish them. Being able to ask for a summary before I commit has saved me time and money.',
  },
];

export const averageTestimonialRating =
  Math.round(
    (testimonials.reduce((total, item) => total + item.rating, 0) /
      testimonials.length) *
      10,
  ) / 10;
