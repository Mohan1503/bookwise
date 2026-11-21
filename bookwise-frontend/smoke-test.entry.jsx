import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { WishlistProvider } from './src/context/WishlistContext';
import ProtectedRoute from './src/components/ProtectedRoute';
import MainLayout from './src/layouts/MainLayout';
import AuthLayout from './src/layouts/AuthLayout';
import Login from './src/pages/Login';
import Signup from './src/pages/Signup';
import Home from './src/pages/Home';
import Explore from './src/pages/Explore';
import BookDetails from './src/pages/BookDetails';
import Categories from './src/pages/Categories';
import Wishlist from './src/pages/Wishlist';
import Cart from './src/pages/Cart';
import Profile from './src/pages/Profile';
import AIReader from './src/pages/AIReader';
import NotFound from './src/pages/NotFound';

function Tree() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
      </Route>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route path="/books" element={<Explore />} />
        <Route path="/books/:id" element={<BookDetails />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/ai-reader" element={<AIReader />} />
        <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
        <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function renderAt(path) {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <Tree />
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const expectations = [
  ['/', 'Find, save and understand'],
  ['/', 'How BookWise is built'],
  ['/login', 'Welcome back'],
  ['/login', 'Demo credentials'],
  ['/signup', 'Create your account'],
  ['/books', 'The whole catalogue'],
  ['/books?category=Fiction', 'Explore books'],
  ['/books/atomic-habits', 'Atomic Habits'],
  ['/books/atomic-habits', 'James Clear'],
  ['/categories', 'Eight collections, one shelf.'],
  ['/categories', 'Personal Development'],
  ['/ai-reader', 'Ask your books anything.'],
  ['/wishlist', 'wishlist'],
  ['/cart', 'cart'],
  ['/profile', 'profile'],
  ['/unknown-page', 'This page took a wrong turn.'],
];

let failures = 0;

for (const [path, needle] of expectations) {
  let html = '';
  try {
    html = renderAt(path);
  } catch (error) {
    failures += 1;
    console.log(`RENDER ERROR  ${path} -> ${error.message}`);
    continue;
  }

  if (!html.toLowerCase().includes(needle.toLowerCase())) {
    failures += 1;
    console.log(`MISSING TEXT  ${path} -> "${needle}"`);
  } else {
    console.log(`ok  ${path.padEnd(28)} contains "${needle}"`);
  }
}

console.log(`\nsmoke failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
