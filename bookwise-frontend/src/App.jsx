import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Explore from './pages/Explore';
import BookDetails from './pages/BookDetails';
import Categories from './pages/Categories';
import Wishlist from './pages/Wishlist';
import Cart from './pages/Cart';
import Profile from './pages/Profile';
import AIReader from './pages/AIReader';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminBooks from './pages/admin/AdminBooks';
import AdminBookEditor from './pages/admin/AdminBookEditor';
import AdminEntityManager from './pages/admin/AdminEntityManager';
import AdminSettings from './pages/admin/AdminSettings';
import NotFound from './pages/NotFound';
import './App.css';

// The reader pulls in PDF.js, so it loads only when someone opens a book.
const Reader = lazy(() => import('./pages/Reader'));

/** The catalogue used to live at /home; keep old links and bookmarks working. */
function LegacyCatalogueRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.delete('view');
  const query = params.toString();
  return <Navigate to={`/books${query ? `?${query}` : ''}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <Routes>
              {/* Home: project overview */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<Home />} />
              </Route>

              {/* Online reader: full screen, signed-in readers only */}
              <Route
                path="/read/:id"
                element={
                  <ProtectedRoute>
                    <Suspense fallback={<div className="reader-loading" role="status">Opening the reader…</div>}>
                      <Reader />
                    </Suspense>
                  </ProtectedRoute>
                }
              />

              {/* Authentication (simplified layout) */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/admin/login" element={<Login adminOnly />} />
              </Route>

              {/* Bookstore and application pages */}
              <Route element={<MainLayout />}>
                <Route path="/books" element={<Explore />} />
                <Route path="/home" element={<LegacyCatalogueRedirect />} />
                <Route path="/books/:id" element={<BookDetails />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/ai-reader" element={<AIReader />} />
                <Route
                  path="/wishlist"
                  element={
                    <ProtectedRoute>
                      <Wishlist />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/cart"
                  element={
                    <ProtectedRoute>
                      <Cart />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Route>

              {/* Admin area - separate layout, no customer navbar/footer */}
              <Route path="/admin" element={<ProtectedRoute requiredRole="superadmin"><AdminLayout /></ProtectedRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="books" element={<AdminBooks />} />
                <Route path="books/new" element={<AdminBookEditor />} />
                <Route path="books/:bookId" element={<AdminBookEditor />} />
                <Route path="authors" element={<AdminEntityManager kind="authors" />} />
                <Route path="categories" element={<AdminEntityManager kind="categories" />} />
                <Route path="publishers" element={<AdminEntityManager kind="publishers" />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>
            </Routes>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
