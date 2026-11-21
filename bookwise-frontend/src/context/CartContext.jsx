import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { getBook } from '../services/api';
import { STORAGE_KEYS } from '../utils/auth';

/**
 * Shopping cart context.
 *
 * Only lightweight identifiers and quantities are persisted — the catalogue
 * itself is reloaded from the API so prices cannot go stale.
 */

const CartContext = createContext(null);


const EMPTY_CART = [];

function sanitiseCart(stored) {
  if (!Array.isArray(stored)) return EMPTY_CART;

  return stored
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => ({
      id: item.id,
      quantity: Math.max(1, Math.min(99, Number(item.quantity) || 1)),
    }));
}

export function CartProvider({ children }) {
  const [items, setItems] = useLocalStorage(STORAGE_KEYS.cart, EMPTY_CART);
  const [booksById, setBooksById] = useState({});
  const [bookError, setBookError] = useState('');
  const [loadedBooksKey, setLoadedBooksKey] = useState('');

  const cartItems = useMemo(() => sanitiseCart(items), [items]);
  const bookIdsKey = cartItems.map((item) => item.id).join(',');

  useEffect(() => {
    const ids = bookIdsKey ? bookIdsKey.split(',') : [];
    if (!ids.length) return;

    let active = true;
    Promise.all(ids.map(async (id) => {
      try {
        return [id, await getBook(id)];
      } catch (error) {
        if (error.status === 404 || error.status === 422) return [id, null];
        throw error;
      }
    }))
      .then((entries) => {
        if (!active) return;
        const foundBooks = Object.fromEntries(entries.filter(([, book]) => book));
        setBooksById(foundBooks);
        setBookError('');
        setLoadedBooksKey(bookIdsKey);
        const missingIds = entries.filter(([, book]) => !book).map(([id]) => id);
        if (missingIds.length) {
          setItems((current) => sanitiseCart(current).filter((item) => !missingIds.includes(item.id)));
        }
      })
      .catch((error) => {
        if (active) {
          setBookError(error.message);
          setLoadedBooksKey(bookIdsKey);
        }
      });

    return () => {
      active = false;
    };
  }, [bookIdsKey, setItems]);

  const addToCart = useCallback(
    (bookId, quantity = 1) => {
      if (typeof bookId !== 'string' || !bookId) return;
      const amount = Math.max(1, Number(quantity) || 1);

      setItems((current) => {
        const safe = sanitiseCart(current);
        const existing = safe.find((item) => item.id === bookId);

        if (existing) {
          return safe.map((item) =>
            item.id === bookId
              ? { ...item, quantity: Math.min(99, item.quantity + amount) }
              : item,
          );
        }

        return [...safe, { id: bookId, quantity: amount }];
      });
    },
    [setItems],
  );

  const removeFromCart = useCallback(
    (bookId) => {
      setItems((current) =>
        sanitiseCart(current).filter((item) => item.id !== bookId),
      );
    },
    [setItems],
  );

  const incrementQuantity = useCallback(
    (bookId) => {
      setItems((current) =>
        sanitiseCart(current).map((item) =>
          item.id === bookId
            ? { ...item, quantity: Math.min(99, item.quantity + 1) }
            : item,
        ),
      );
    },
    [setItems],
  );

  const decrementQuantity = useCallback(
    (bookId) => {
      setItems((current) =>
        sanitiseCart(current)
          .map((item) =>
            item.id === bookId ? { ...item, quantity: item.quantity - 1 } : item,
          )
          .filter((item) => item.quantity > 0),
      );
    },
    [setItems],
  );

  const clearCart = useCallback(() => setItems(EMPTY_CART), [setItems]);

  const detailedItems = useMemo(
    () =>
      cartItems
        .map((item) => {
          const book = booksById[item.id];
          if (!book) return null;
          return { ...book, quantity: item.quantity, lineTotal: book.price * item.quantity };
        })
        .filter(Boolean),
    [cartItems, booksById],
  );

  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems],
  );

  const subtotal = useMemo(
    () => detailedItems.reduce((total, item) => total + item.lineTotal, 0),
    [detailedItems],
  );

  const value = useMemo(
    () => ({
      items: detailedItems,
      error: bookError,
      loading: Boolean(bookIdsKey) && loadedBooksKey !== bookIdsKey,
      cartCount,
      subtotal,
      total: subtotal,
      addToCart,
      removeFromCart,
      incrementQuantity,
      decrementQuantity,
      clearCart,
      isInCart: (bookId) => cartItems.some((item) => item.id === bookId),
      getQuantity: (bookId) =>
        cartItems.find((item) => item.id === bookId)?.quantity ?? 0,
    }),
    [
      detailedItems,
      bookError,
      bookIdsKey,
      loadedBooksKey,
      cartCount,
      subtotal,
      addToCart,
      removeFromCart,
      incrementQuantity,
      decrementQuantity,
      clearCart,
      cartItems,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside a CartProvider');
  }
  return context;
}

export default CartContext;
