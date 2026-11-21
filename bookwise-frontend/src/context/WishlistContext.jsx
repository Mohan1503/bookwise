import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  addWishlistItem,
  clearWishlist as clearWishlistRequest,
  listWishlist,
  removeWishlistItem,
} from '../services/api';

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [wishlistState, setWishlistState] = useState({ userId: null, items: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const userId = user.id;
    listWishlist()
      .then((items) => setWishlistState({ userId, items }))
      .catch((requestError) => setError(requestError.message));
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(''), 4500);
    return () => window.clearTimeout(timer);
  }, [error]);

  const visibleWishlistItems = useMemo(
    () => isAuthenticated && wishlistState.userId === user?.id ? wishlistState.items : [],
    [isAuthenticated, user?.id, wishlistState],
  );

  const addToWishlist = useCallback(async (bookId) => {
    try {
      const book = await addWishlistItem(bookId);
      setWishlistState((current) => {
        const items = current.userId === user?.id ? current.items : [];
        return {
          userId: user?.id ?? null,
          items: items.some((item) => item.id === book.id) ? items : [...items, book],
        };
      });
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  }, [user]);

  const removeFromWishlist = useCallback(async (bookId) => {
    try {
      await removeWishlistItem(bookId);
      setWishlistState((current) => ({
        userId: user?.id ?? null,
        items: (current.userId === user?.id ? current.items : []).filter((item) => item.id !== bookId),
      }));
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  }, [user]);

  const toggleWishlist = useCallback(async (bookId) => {
    const saved = visibleWishlistItems.some((item) => item.id === bookId);
    return saved ? removeFromWishlist(bookId) : addToWishlist(bookId);
  }, [addToWishlist, removeFromWishlist, visibleWishlistItems]);

  const clearWishlist = useCallback(async () => {
    try {
      await clearWishlistRequest();
      setWishlistState({ userId: user?.id ?? null, items: [] });
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [user]);

  const wishlistIds = useMemo(() => visibleWishlistItems.map((book) => book.id), [visibleWishlistItems]);
  const value = useMemo(() => ({
    wishlistIds,
    wishlistItems: visibleWishlistItems,
    wishlistCount: wishlistIds.length,
    error,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    clearWishlist,
    isInWishlist: (bookId) => wishlistIds.includes(bookId),
  }), [
    wishlistIds,
    visibleWishlistItems,
    error,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    clearWishlist,
  ]);

  return (
    <WishlistContext.Provider value={value}>
      {children}
      {error ? <div className="toast" role="alert">{error}</div> : null}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used inside a WishlistProvider');
  return context;
}

export default WishlistContext;
