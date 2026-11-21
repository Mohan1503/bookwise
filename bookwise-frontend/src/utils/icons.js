import {
  Award,
  BookOpen,
  Brain,
  Briefcase,
  Compass,
  Cpu,
  Feather,
  Heart,
  Home,
  LayoutGrid,
  Microscope,
  PiggyBank,
  ShoppingBag,
  Sparkles,
  User,
} from 'lucide-react';

/**
 * Maps icon names stored in the data files to Lucide React components.
 * Keeps `src/data/*` free of JSX so the data stays serialisable.
 */
export const iconRegistry = {
  Award,
  BookOpen,
  Brain,
  Briefcase,
  Compass,
  Cpu,
  Feather,
  Heart,
  Home,
  LayoutGrid,
  Microscope,
  PiggyBank,
  ShoppingBag,
  Sparkles,
  User,
};

export const defaultIcon = BookOpen;

export default iconRegistry;
