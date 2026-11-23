import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import './App.css';

// Pages other than Home and sign-in load when first visited, so the first page of the
// site downloads far less code. The reader also pulls in PDF.js.
const loaders = {
  explore: () => import('./pages/Explore'),
  bookDetails: () => import('./pages/BookDetails'),
  categories: () => import('./pages/Categories'),
  aiReader: () => import('./pages/AIReader'),
  reader: () => import('./pages/Reader'),
  stories: () => import('./pages/Stories'),
};
const Explore = lazy(loaders.explore);
const BookDetails = lazy(loaders.bookDetails);
const Categories = lazy(loaders.categories);
const AIReader = lazy(loaders.aiReader);
const Reader = lazy(loaders.reader);
const Stories = lazy(loaders.stories);
const StoryCollection = lazy(() => import('./pages/StoryCollection'));
const StoryReader = lazy(() => import('./pages/StoryReader'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Cart = lazy(() => import('./pages/Cart'));
const Profile = lazy(() => import('./pages/Profile'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminBooks = lazy(() => import('./pages/admin/AdminBooks'));
const AdminBookEditor = lazy(() => import('./pages/admin/AdminBookEditor'));
const AdminEntityManager = lazy(() => import('./pages/admin/AdminEntityManager'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

// Once the first page is up and the browser is idle, fetch the most visited pages so
// clicking them is still instant.
if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback ?? ((callback) => window.setTimeout(callback, 1500));
  idle(() => Object.values(loaders).forEach((load) => load().catch(() => {})));
}

function PageFallback() {
  return <div className="page-loading" role="status" aria-label="Loading page" />;
}

/** A lazily loaded page, with a quiet placeholder while its code downloads. */
function page(Component, props) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Component {...props} />
    </Suspense>
  );
}

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

              {/* Story reader: full screen, signed-in readers only */}
              <Route
                path="/stories/:bookId/:position"
                element={
                  <ProtectedRoute>
                    <Suspense fallback={<div className="reader-loading" role="status">Opening the story…</div>}>
                      <StoryReader />
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
                <Route path="/books" element={page(Explore)} />
                <Route path="/home" element={<LegacyCatalogueRedirect />} />
                <Route path="/books/:id" element={page(BookDetails)} />
                <Route path="/categories" element={page(Categories)} />
                <Route path="/ai-reader" element={page(AIReader)} />
                <Route path="/stories" element={page(Stories)} />
                <Route path="/stories/:bookId" element={page(StoryCollection)} />
                <Route
                  path="/wishlist"
                  element={
                    <ProtectedRoute>
                      {page(Wishlist)}
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/cart"
                  element={
                    <ProtectedRoute>
                      {page(Cart)}
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      {page(Profile)}
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={page(NotFound)} />
              </Route>

              {/* Admin area - separate layout, no customer navbar/footer */}
              <Route path="/admin" element={<ProtectedRoute requiredRole="superadmin">{page(AdminLayout)}</ProtectedRoute>}>
                <Route index element={page(AdminDashboard)} />
                <Route path="books" element={page(AdminBooks)} />
                <Route path="books/new" element={page(AdminBookEditor)} />
                <Route path="books/:bookId" element={page(AdminBookEditor)} />
                <Route path="authors" element={page(AdminEntityManager, { kind: 'authors' })} />
                <Route path="categories" element={page(AdminEntityManager, { kind: 'categories' })} />
                <Route path="publishers" element={page(AdminEntityManager, { kind: 'publishers' })} />
                <Route path="settings" element={page(AdminSettings)} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>
            </Routes>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
